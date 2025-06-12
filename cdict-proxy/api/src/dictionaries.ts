import { IRequestStrict } from "itty-router";

export async function getDictionary( name:String, req:IRequestStrict ) {
    // name should already be the full name relative to assets/dictionaries/
    // const dictResponse = await fetch(`/static/dictionaries/${name}`);
    const dictResponse = await fetch(`https://assets.spin.internal/dictionaries/${name}`);
    

    console.log(`[dictionaries]: fetched ${name}`);

    let headers: Headers = new Headers();

    if ( name === "common.dict" ) {

        headers.set("Cache-Control", `public, max-age=300`);
        headers.set("Content-Type", `text/plain; charset=UTF-8`);
        headers.set("Vary", `Accept-Encoding`);
        headers.set("Use-As-Dictionary", `match="/pages/*", match-dest=("document" "frame"), id="${name}"`);

        // match="/pages/*", match-dest=("document"), id="common.dict"
    }

    else if ( name === "big-specific.dict" ) {

        headers.set("Cache-Control", `public, max-age=300`);
        headers.set("Content-Type", `text/plain; charset=UTF-8`);
        headers.set("Vary", `Accept-Encoding`);
        headers.set("Use-As-Dictionary", `match="/pages/big.txt", match-dest=("document" "frame"), id="${name}"`);
    }

    console.log(`[dictionaries]: returning ${dictResponse.status} ==> ${JSON.stringify(headers)}`);
    return new Response(dictResponse.body, { status: dictResponse.status, headers: headers });
}