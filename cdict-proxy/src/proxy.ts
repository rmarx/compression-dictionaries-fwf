import { IRequestStrict } from "itty-router";

export async function proxy( req:IRequestStrict ) {

    // return "Proxying for compression dictionaries. " + req.params.filepath;

    console.log("Proxying for compression dictionaries. " + req.params.filepath);

    // reqpath should be relative to assets. So files/myfile.txt and NOT assets/files/myfile.txt
    const res = await fetch(`/static/${req.params.filepath}`);
    return new Response(res.body, { status: res.status });

    // let { file } = req.params;
    // const res = await fetch(`/static/assets/train/${file}`);

    // // If the request headers contained a dictionary ID, compress the outgoing stream.
    // // Otherwise, stream the response unaltered.
    // // This currently only supports Dictionary Compressed Zstandard streams.
    // let acceptEncoding = req.headers.get("Accept-Encoding") || "";
    // let id = req.headers.get("Dictionary-Id");
    // if (req.headers.get("Available-Dictionary") && id && acceptEncoding.includes("dcz")) {
    //     console.log(`[compression]: Requested compression for file ${file} with dictionary ${id}`);

    //     // Instantiate the compressor and create a new transform stream.
    //     // Setting the default compression level here as 0.
    //     let compressor = new Compressor(0, id);
    //     let compressionStream = new TransformStream({
    //         transform(chunk, controller) {
    //             // for each chunk, compress thy bytes, then stream them
    //             let buf = compressor.addBytes(chunk);
    //             controller.enqueue(buf);
    //         }, flush(controller) {
    //             let final = compressor.finish();
    //             controller.enqueue(final);
    //         }
    //     });

    //     return new Response(res.body?.pipeThrough(compressionStream), { status: res.status });
    //     // The request did not have the right headers, so passing the stream along unaltered.
    // } else {
    //     console.log(`[compression]: Streaming file ${file} unaltered`);
    //     return new Response(res.body, { status: res.status });
    // }
}