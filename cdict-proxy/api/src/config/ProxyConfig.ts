import { IRequest } from "itty-router";

export class ProxyConfig {

    // if not set/empty it means we shouldn't compress
    compression?: {
        algorithm: "zstd"; // | "brotli" | "gzip"
        level: number;

        dictionary?: {
            id?: string; // as passed in Dictionary-Id header
            filename: string; // name with extension but not path  NAME.EXT
            filepath: string; // full path relative to compression dictionary origin or local cache  /f1/f2/NAME.EXT

            sha256hash?: string; // base64-encoded sha256 hash of the dictionary file as passed in Available-Dictionary header
        }
    }
}

export function parseProxyConfig(req:IRequest) {

    let proxyConfig:ProxyConfig = new ProxyConfig();
    req.proxyConfig = proxyConfig;

    // no use trying to compress if the client doesn't support the needed compression algorithms
    const acceptEncoding = req.headers.get("Accept-Encoding");
    let acceptedEncodings:Array<string> = [];
    // this header is a list of accepted encodings, separated by comma and space. e.g., Accept-Encoding: gzip, deflate, br, zstd, dcb, dcz
    if ( acceptEncoding && acceptEncoding !== "" ) {
        acceptedEncodings = acceptEncoding.split(",").map( v => v.trim() );
    }

    // we currently only do zstd, so at least one of these needs to be present to do anything useful
    if ( !acceptedEncodings.includes("zstd") && !acceptedEncodings.includes("dcz") ) {
        // we're just bypassing compression alltogether
        proxyConfig.compression = undefined;
        return;
    }

    proxyConfig.compression = {
        algorithm: "zstd",
        level: 3
    };

    // by default, we just follow the browser if it sends Available-Dictionary and use zstd
    // you can manually control the compression algo and dictionary used with query parameters

    // ?calgo=none : disables all compression, returns the raw plaintext resource
    // ?cdict=none : disables using a compression dictionary (setting just this compresses with the default algo, just without a dictionary)
    // ?clevel=XYZ : sets compression level manually (default is 3)

    if ( req.query ){
        if ( req.query.calgo === "none" ) {
            proxyConfig.compression = undefined;
            return; // we're just bypassing compression alltogether
        }

        if ( req.query.clevel ) {
            let clevel = parseInt("" + req.query.clevel as string);
            if ( !isNaN(clevel) ) {
                proxyConfig.compression.level = clevel;
            }
        }

        if ( req.query.cdict === "none" ) {
            req.proxyConfig.dictionary = undefined;
            return;
        }
    }

    let dictHashBase64 = req.headers.get("Available-Dictionary");

    // this header MUST be present as it contains the sha256 hash for the dict that we need for the magical header before the compressed response
    // "Dictionary-Id" is optional to have another alias for the dict instead of just the hash
    if ( dictHashBase64 && dictHashBase64 !== "" ) {

        // due to how this value is communicated in HTTP headers, it is surrounded by colons (e.g., Available-Dictionary: :xN/piJymCQY+O0DY1CaxSc92f0sTxIM2DqVtRf5wXn4=:)
        // We need to strip those prior to actual usage
        dictHashBase64 = dictHashBase64.trim().replaceAll(':', '');

        
        let dictionaryID = req.headers.get("Dictionary-Id");
        if ( dictionaryID && dictionaryID !== "" ) {
            // dictionaryID is passed by the chrome browser with " around it... not sure if that's intentional or not
            //  -> probably so we can use any characters in the name when passing it with Use-As-Dictionary
            // is also in the spec like this: https://www.ietf.org/archive/id/draft-ietf-httpbis-compression-dictionary-19.html#section-2.3
            // so header looks like this:   Dictionary-Id: "common.dict"   instead of   Dictionary-Id: common.dict
            // we need to get rid of the " since we want to use it as a filename
            dictionaryID = dictionaryID.trim().replaceAll('"', '');
        }
        else
            dictionaryID = "";

        
        
        // Now we need to decide if we can actually adhere to what the client is asking with acceptedEncodings
        // if it contains neither dcb nor dcz, we can't do dictionary compression.
        // if it does not contain dcz, we can't do zstd dictionary compression, but we might be able to do brotli if it does contain dcb
        // keeping it semi-hardcoded for now to make it readable :) (we currently only support zstd)

        if ( acceptedEncodings.includes("dcz") ) {
            proxyConfig.compression.algorithm = "zstd";
            proxyConfig.compression.dictionary = {
                sha256hash: dictHashBase64,
                id: dictionaryID,

                // for now, these two are the same to keep things easy
                filename: dictionaryID,

                // dictionaryID is the filename within the /dictionaries folder
                // this works because in spin.toml we map /assets into / for the main app
                // should be of the form    FILENAME.dict
                filepath: `dictionaries/${dictionaryID}` // 
            }
        }
        else {
            // no dictionary compression possible!
            proxyConfig.compression.dictionary = undefined;
            return;
        }
    }
}