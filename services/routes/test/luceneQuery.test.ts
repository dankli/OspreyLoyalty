import { expect, test } from "vitest";
import { luceneQuery } from "../src/features/airports/luceneQuery.js";

test("terms become prefix matches joined with AND", () => {
  expect(luceneQuery("arn")).toBe("arn*");
  expect(luceneQuery("new york")).toBe("new* AND york*");
});

test("lucene operators in user input are escaped, not executed", () => {
  expect(luceneQuery("a+b")).toBe("a\\+b*");
  expect(luceneQuery('foo:bar "baz"')).toBe("foo\\:bar* AND \\\"baz\\\"*");
});

test("blank input yields an empty query", () => {
  expect(luceneQuery("   ")).toBe("");
});
