import { IRequest } from "itty-router";

export class DebugConfig {

    // if not set/empty it means we shouldn't compress
    debug?: {
        level: "error" | "warn" | "debug";
    }
}

export function parseDebugConfig(req:IRequest) {

    let debugConfig:DebugConfig = new DebugConfig();
    req.debugConfig = debugConfig;

    let allHeaders = {} as any;
    req.headers.forEach( (v, k, p) => allHeaders[ "" + k ] = v );

    console.log("[debugconf] : queries: ", JSON.stringify(req.url),  JSON.stringify(req.query),  JSON.stringify(req.params) );
    console.log("[debugconf] : headers: ", JSON.stringify(allHeaders) );

    // req.query is an object with string keys and values (e.g., ?log=debug&robin=test will be {"log":"debug", "robin": "test"} )
    // in JS, properties can be accessed with [] as well

    if ( req.query["log"] ) {
        req.debugConfig = { 
            level: req.query["log"]
        }
    }
}