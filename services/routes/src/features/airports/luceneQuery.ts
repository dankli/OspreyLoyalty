// Pure translation of raw typeahead input into a safe Lucene query for the
// airport_search full-text index: special syntax is escaped (user input must never
// become operators) and each term gets a trailing * so partial words match while typing.

const LUCENE_SPECIAL = /[+\-&|!(){}[\]^"~*?:\\/]/g;

export function luceneQuery(input: string): string {
  const terms = input
    .split(/\s+/)
    .map((term) => term.replace(LUCENE_SPECIAL, "\\$&"))
    .filter((term) => term.length > 0);
  return terms.map((term) => `${term}*`).join(" AND ");
}
