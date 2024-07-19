import { Evaluator } from "./rdp.mjs";

const evaluator = new Evaluator();
const cases = [
    // Errors
    ["", NaN],
    ["a", NaN],
    ["(", NaN],
    [")", NaN],
    ["+", NaN],
    ["-", NaN],
    ["*", NaN],
    ["%", NaN],
    ["/", NaN],
    [".", NaN],
    ["a1", NaN],
    ["1a", NaN],
    ["()", NaN],
    ["2**", NaN],
    ["2//", NaN],
    ["2..", NaN],
    ["..2", NaN],
    ["2..2", NaN],
    ["2+(3", NaN],
    ["(2+3", NaN],
    ["2+3)", NaN],
    ["2.2.2", NaN],
    ["(2+3))", NaN],

    // Arithmetics
    ["69", 69],
    ["-69", -69],
    ["-(69)", -69],
    ["(-69)", -69],
    ["23 * 3", 69],
    ["34 + 35", 69],
    ["2%%", 0.0002],
    ["-69%", -0.69],
    ["138 - 69", 69],
    ["1/0", Infinity],
    ["100 - 31%", 69],
    ["(-69%)", -0.69],
    ["6.9 + 900%", 69],
    ["476.1 / 6.9", 69],
    ["6.9 * 1000%", 69],
    ["100 + (100 + 10%)", 210],

    // New
    ["2 ^ 2", 4],
    ["(2) ^ (2)", 4],
    ["2 ^ 3 ^ 2", 512],
    ["(2 ^ 3) ^ 2", 64],

    //Debug
    ["100 + 10%", 110],
    ["100 + 10% + 10%", 121],
    ["100 + (100 + 10%)", 210],
    ["100 + (10% + 10%)", 100.11],
    ["100 + (100 * 2) + 10%", 330],
    ["100 + ((100 * 2) + 10% + (4/2))", 322],
];

let success = 0;
let failure = 0;

for (let i = 0; i < cases.length; i++) {
    const [input, expected] = cases[i];
    const actual = evaluator.evaluate(input);
    console.log("\x1b[0m" + `Test Case: ${i + 1}`);

    const displayInput = input.trim();
    const displayActual = `Actual: ${actual}`;
    const displayExpected = `Expected: ${expected}`;

    console.log("\x1b[36m" + `Input: ${displayInput}`);
    console.log("\x1b[32m" + displayExpected);

    if (actual === expected || Number.isNaN(actual) === Number.isNaN(expected)) {
        console.log("\x1b[32m" + displayActual);
        success++;
    } else {
        console.log("\x1b[31m" + displayActual);
        failure++;
    }
    console.log("\x1b[0m");
}

console.log(`Total Tests: ${cases.length}`);
console.log("\x1b[32m" + `Success: ${success}`);
console.log("\x1b[31m" + `Failure: ${failure}`);
