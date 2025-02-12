import { IRequestStrict } from "itty-router";
import ZstdCompressor from "./compression/ZstdCompressor";

export async function proxy( req:IRequestStrict ) {

    // return "Proxying for compression dictionaries. " + req.params.filepath;

    console.log("Proxying for compression dictionaries. " + req.params.filepath);

    // reqpath should be relative to assets. So files/myfile.txt and NOT assets/files/myfile.txt
    const originalResponse = await fetch(`/static/${req.params.filepath}`);

    const availableDictionary = req.headers.get("Available-Dictionary");
    const acceptEncoding = req.headers.get("Accept-Encoding");

    if ( !availableDictionary || !acceptEncoding || !acceptEncoding.split(",").includes("dcz") ) {
        console.log(`[proxy]: Streaming file ${req.params.filepath} unaltered`);
        return new Response(originalResponse.body, { status: originalResponse.status });
    }
    else if ( availableDictionary !== "" ) {
        return ZstdCompress( originalResponse, availableDictionary );
    }

    console.log(`[proxy]: Streaming file ${req.params.filepath} unaltered PASSTHROUGH`);
    return new Response(originalResponse.body, { status: originalResponse.status });
}

async function ZstdCompress(responseStream:Response, dictionaryID:string) {

    console.log(`[proxy]: Zstd Compressing ${responseStream.url} with ${dictionaryID}`);

    let compressor = new ZstdCompressor(0, dictionaryID);

    let compressionStream = new TransformStream({
        transform(chunk, controller) {
            // for each chunk, compress thy bytes, then stream them
            let buf = compressor.addBytes(chunk);
            controller.enqueue(buf);
        }, flush(controller) {
            let final = compressor.finish();
            controller.enqueue(final);
        }
    });

    return new Response(responseStream.body?.pipeThrough(compressionStream), { status: responseStream.status });
}