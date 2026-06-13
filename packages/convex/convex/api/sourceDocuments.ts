import { query } from "../_generated/server";
import * as SourceDocuments from "../model/sourceDocuments";

export const list = query({
	args: {},
	handler: (ctx) => SourceDocuments.listSourceDocuments(ctx),
});
