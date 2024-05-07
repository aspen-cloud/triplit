import {
  anyCharOf,
  anyStringOf,
  float,
  letter,
  string,
  whitespace,
} from 'parjs';
import {
  between,
  manySepBy,
  manyTill,
  many,
  map,
  qthen,
  then,
  thenq,
  flatten,
  or,
  pipe,
  maybe,
} from 'parjs/combinators';

/**
 * This parses a query string into a query object
 * @param query The query string to parse e.g. "todos where completed = false, text like 'The' limit:10 order: created_at desc"
 */
export function parseQuery(queryText: string) {
  const word = letter().pipe(
    many(),
    map((chars) => chars.join(''))
  );
  //   const bool = pipe(or(string('true'), string('false')), map((str) => str === 'true'));
  const bool = anyStringOf('true', 'false').pipe(map((str) => str === 'true'));
  const value = bool.pipe(
    or(float(), word.pipe(between(string("'"), string("'"))))
  );
  const operators = anyCharOf('=><');
  const filter = word.pipe(
    thenq(whitespace()),
    then(operators),
    thenq(whitespace()),
    then(value),
    flatten()
  );
  const whereStatement = string('where').pipe(
    thenq(whitespace()),
    then(filter.pipe(manySepBy(string(' and ')))),
    map(([, filters]) => filters)
  );
  const query = word.pipe(
    thenq(whitespace()),
    then(
      whereStatement.pipe(
        maybe(),
        map((filters) => ({ where: filters }))
      )
    )
  );
  return query.parse(queryText);
}
