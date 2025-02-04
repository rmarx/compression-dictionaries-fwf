// For AutoRouter documentation refer to https://itty.dev/itty-router/routers/autorouter
import { AutoRouter, IRequestStrict, withParams } from 'itty-router';
import { getDictionary } from './dictionaries';
import { proxy } from './proxy';

let router = AutoRouter();

// for production deployment, the /dictionaries path prefix should probably 
// include a random value so it doesn't collide with existing files (e.g., /dictionaries-ab125nx)
const dictionaryPathPrefix = "dictionaries";

router
    .get(`/${dictionaryPathPrefix}/:name`,  (req:IRequestStrict) => { return getDictionary(req.params.name, req) })
    .get(`/:filepath+`,                     (req:IRequestStrict) => { return proxy(req) })

//@ts-ignore
addEventListener('fetch', async (event: FetchEvent) => {
    event.respondWith(router.fetch(event.request));
});
