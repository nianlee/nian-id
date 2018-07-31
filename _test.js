const nianId = require("./index");
const vm = require("vm");

const jsBundle = nianId(process.argv[2]);

vm.runInThisContext(jsBundle);
