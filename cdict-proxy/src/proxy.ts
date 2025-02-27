import { IRequestStrict } from "itty-router";
import ZstdCompressor from "./compression/ZstdCompressor";

export async function proxy( req:IRequestStrict ) {

    // return "Proxying for compression dictionaries. " + req.params.filepath;

    console.log("Proxying for compression dictionaries. " + req.params.filepath);

    // reqpath should be relative to assets. So files/myfile.txt and NOT assets/files/myfile.txt
    const originalResponse = await fetch(`https://assets.spin.internal/${req.params.filepath}`);


    console.log("Proxying for compression dictionaries 2 fetch returned. " + originalResponse.status + " // " + JSON.stringify(originalResponse.headers));

    let availableDictionary = req.headers.get("Available-Dictionary");
    let dictionaryID = req.headers.get("Dictionary-Id");
    const acceptEncoding = req.headers.get("Accept-Encoding");

    if ( dictionaryID && dictionaryID !== "" ) {
        // dictionaryID is passed by the chrome browser with " around it... not sure if that's intentional or not
        //  -> probably so we can use any characters in the name when passing it with Use-As-Dictionary
        // is also in the spec like this: https://www.ietf.org/archive/id/draft-ietf-httpbis-compression-dictionary-19.html#section-2.3
        // so header looks like this:   Dictionary-Id: "common.dict"   instead of   Dictionary-Id: common.dict
        // we need to get rid of the " since we want to use it as a filename
        dictionaryID = dictionaryID.trim().replaceAll('"', '');
    }

    if ( (req.query.bypasscomp && req.query.bypasscomp === "true") || !availableDictionary || !dictionaryID || !acceptEncoding || !acceptEncoding.split(",").map( v => v.trim() ).includes("dcz") ) {
        console.log(`[proxy]: Streaming file ${req.params.filepath} unaltered`);
        console.log(`[proxy]: ${availableDictionary} - ${dictionaryID} - ${acceptEncoding}`);
        return new Response(originalResponse.body, { status: originalResponse.status });
    }
    else if ( availableDictionary !== "" ) {

        let zstdLevel = 3;
        if ( req.query.level ) {
            zstdLevel = parseInt( "" + req.query.level );
            if ( isNaN(zstdLevel) )
                zstdLevel = 3;
        }

        // way to force us to skip using the dictionary and do raw zstd (for comparison)
        if ( req.query.nodict === "true" ) {
            availableDictionary = "";
            dictionaryID = "";
        }

        console.log(`[proxy]: pre zstd compress with level ${zstdLevel}`);
        const compressionStream = ZstdCompress( zstdLevel, originalResponse, availableDictionary, dictionaryID );
        console.log(`[proxy]: post zstd compress`);

        let headers: Headers = new Headers( originalResponse.headers );
        if ( dictionaryID !== "" ) {
            headers.set("Content-Encoding", "dcz");
            headers.set("Vary", "Accept-Encoding, Available-Dictionary");
        }
        else {
            headers.set("Content-Encoding", "zstd");
            headers.set("Vary", "Accept-Encoding");
        }

        console.log(`[proxy]: pre zstd return`);

        
        return new Response(originalResponse.body?.pipeThrough(compressionStream), { status: originalResponse.status, headers: headers });

        // return new Response(compressedStream as any, { status: originalResponse.status, headers: headers });
    }

    console.log(`[proxy]: Streaming file ${req.params.filepath} unaltered PASSTHROUGH`);
    return new Response(originalResponse.body, { status: originalResponse.status });
}

function base64ToUint8Array(base64String:string) {
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

    let compressor = new ZstdCompressor(zstdLevel, dictionaryFileName);

    console.log(`[proxy]: post ZstdCompressor initialize`);



    // compression dictionaries require a magic header value to be written before the stream
    let headerWritten = false;

    let compressionStream = new TransformStream({
        transform(chunk, controller) {

            // dictionaryFileName check is to support non-dictionary-compressed zstd as well (to compare sizes with/without)
            if (!headerWritten && dictionaryFileName !== "") {

                const dictRaw = dictionaryHash.trim().replaceAll(':', '');
                console.log(`Calculating hash for dictRaw: ${dictRaw}`);
                const dictHash = base64ToUint8Array(dictRaw);

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
