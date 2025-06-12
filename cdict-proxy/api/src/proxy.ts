import { IRequest } from "itty-router";
import { compress as ZstdCompressor } from "@spin-deps/component-compressor"
import { ProxyConfig } from "./config/ProxyConfig";

export async function proxy( req:IRequest ) {

    // return "Proxying for compression dictionaries. " + req.params.filepath;

    const config:ProxyConfig = req.proxyConfig;


    console.log("Proxying for compression dictionaries. " + req.params.filepath);

    // reqpath should be relative to assets. So files/myfile.txt and NOT assets/files/myfile.txt
    // const originalResponse = await fetch(`/static/${req.params.filepath}`);
    const originalResponse = await fetch(`https://assets.spin.internal/${req.params.filepath}`);


    console.log(`[proxy]: compression config for ${req.params.filepath} : ${ JSON.stringify(config) }, debug config: ${ JSON.stringify(req.debugConfig) }`);
    console.log(`[proxy]: handling ${req.params.filepath} : origin returned ${originalResponse.status}`);

    if ( !config.compression || originalResponse.status !== 200 ) {
        console.log(`[proxy]: Streaming file ${req.params.filepath} unaltered`);

        // either no compression needed or erroneous request: just pass through without touching
        return originalResponse; // new Response(originalResponse.body, { status: originalResponse.status, headers: originalResponse.headers });
    }

    // console.log("Proxying for compression dictionaries 2 fetch returned. " + originalResponse.status + " // " + JSON.stringify(originalResponse.headers));

    // we also support just compressing to zstd/brotli without using a dictionary
    const useDictionary = config.compression!.dictionary !== undefined;
    const dictHash = useDictionary ? config.compression.dictionary?.sha256hash! : "";
    const dictFilename = useDictionary ? config.compression.dictionary?.filename! : "";

    
    //else if ( availableDictionary !== "" ) {

        console.log(`[proxy]: pre zstd compress with level ${config.compression.level}`);
        const compressionStream = ZstdCompress( config.compression!.level, originalResponse, dictHash, dictFilename );
        console.log(`[proxy]: post zstd compress`);

        let headers: Headers = new Headers( originalResponse.headers );
        if ( useDictionary ) {
            headers.set("Content-Encoding", "dcz");
            headers.set("Vary", "Accept-Encoding, Available-Dictionary");

            // Akamai doesn't handle Vary directly and we want to remove the Vary header wholesale there
            // however, we do want to know if we need to add Available-Dictionary downstream to the browser, 
            // to use an X- header that we can extract from on the Akamai side
            headers.set("X-CDICT-Vary", "Accept-Encoding, Available-Dictionary");
        }
        else {
            headers.set("Content-Encoding", "zstd");
            headers.set("Vary", "Accept-Encoding");
        }

        headers.set("cache-control", "public, no-transform, max-age=300");

        console.log(`[proxy]: pre zstd return`);


        let respHeaders = {} as any;
        headers.forEach( (v, k, p) => respHeaders[ "" + k ] = v );
        console.log(`[proxy]: response headers for ${req.params.filepath} : ${JSON.stringify(respHeaders)}`);
        
        return new Response(originalResponse.body?.pipeThrough(compressionStream), { status: originalResponse.status, headers: headers });

        // return new Response(compressedStream as any, { status: originalResponse.status, headers: headers });
    //}

    // console.log(`[proxy]: Streaming file ${req.params.filepath} unaltered PASSTHROUGH`);
    // return new Response(originalResponse.body, { status: originalResponse.status });
}

function base64ToUint8Array(base64String:string) {
    // TODO: handle exception if unknown character is found in string (currently just crashes the whole app instead of cleanly exiting)
    const decodedString = atob(base64String);
    const uint8Array = new Uint8Array(decodedString.length);
  
    for (let i = 0; i < decodedString.length; i++) {
        uint8Array[i] = decodedString.charCodeAt(i);
    }
  
    return uint8Array;
}


function ZstdCompress(zstdLevel:number, responseStream:Response, dictionaryHash:string, dictionaryFileName:string) {

    console.log(`[proxy]: Zstd Compressing ${responseStream.url} with ${dictionaryFileName} @ level ${zstdLevel}`);

    // dictionaryID is the filename within the /dictionaries folder
    // this works because in spin.toml we map /assets into / for the main app
    // should be of the form    FILENAME.dict

    let dictionaryPath = "";
    if ( dictionaryFileName !== "" ) {
        dictionaryFileName = `dictionaries/${dictionaryFileName}`;
    }

    let compressor = new ZstdCompressor.Compressor(zstdLevel, dictionaryFileName);

    console.log(`[proxy]: post ZstdCompressor initialize`);



    // compression dictionaries require a magic header value to be written before the stream
    let headerWritten = false;

    let compressionStream = new TransformStream({
        transform(chunk, controller) {

            // dictionaryFileName check is to support non-dictionary-compressed zstd as well (to compare sizes with/without)
            if (!headerWritten && dictionaryFileName !== "") {

                console.log(`Calculating hash for dictRaw: ${dictionaryHash}`);
                const dictHash = base64ToUint8Array(dictionaryHash);

                const dczHeader = new Uint8Array([0x5e, 0x2a, 0x4d, 0x18, 0x20, 0x00, 0x00, 0x00, ...dictHash]);
                controller.enqueue(dczHeader);
                console.log(`[proxy]: written header: ${dczHeader}`);
                headerWritten = true;
            }

            // for each chunk, compress thy bytes, then stream them
            let buf = compressor.addBytes(chunk);

            console.log(`[proxy]: writing compressed chunk: ${chunk.length} -> ${buf.length}`);

            controller.enqueue(buf);
        }, flush(controller) {

            console.log(`[proxy]: zstd flush called`);
            let final = compressor.finish();
            console.log(`[proxy]: writing final compressed chunk: ${final.length}`);
            controller.enqueue(final);
        }
    });

    console.log(`[proxy]: pre return pipeThrough`);

    return compressionStream;
}