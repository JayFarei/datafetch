# Grader v2 fixture outcomes

## Frozen pilot answers

| row | fixture | expected | actual | reason |
| --- | --- | --- | --- | --- |
| otc-0001 | armN | false | false | semantic mismatch |
| otc-0001 | armR | true | true | semantic match |
| otc-0001 | armL | false | false | semantic mismatch |
| otc-0009 | armN | false | false | semantic mismatch |
| otc-0009 | armR | true | true | semantic match |
| otc-0009 | armL | false | false | semantic mismatch |
| otc-0153 | armN | null | null | missing answer value |
| otc-0153 | armR | null | null | missing answer value |
| otc-0153 | armL | false | false | exact trace containment |

## Deliberately wrong cases

| row | fixture | expected | actual | reason |
| --- | --- | --- | --- | --- |
| otc-0001 | wrong aggregate token | false | false | semantic mismatch |
| otc-0009 | wrong empty set | false | false | semantic mismatch |
| otc-0153 | wrong exact trace | false | false | exact trace containment |

## Additional semantic cases

| row | fixture | expected | actual | reason |
| --- | --- | --- | --- | --- |
| otc-0153 | exact trace string positive | true | true | exact trace containment |
