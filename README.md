# Recursive Descent Parser

A Recursive Descent Parser is a kind of top-down parser built from a set of mutually recursive procedures
where each such procedure implements one of the nonterminals of the grammar. 
Thus the structure of the resulting program closely mirrors that of the grammar it recognizes.

## Grammer
 - expr   : term | term + term | term − term
 - term   : factor | factor * factor | factor / factor
 - power  : factor | factor ^ power
 - factor : number | ( expr ) | + factor | − factor | % factor

## Development
JavaScript:

```node rdp.test.js```

TypeScript:

```bun rdp.test.ts```
