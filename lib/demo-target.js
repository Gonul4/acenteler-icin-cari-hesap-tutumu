const DEMO_URI = "mongodb://127.0.0.1:27018/apexcari_demo";

function assertDemoTarget(uri, nodeEnv) {
  if (nodeEnv !== "development" || uri !== DEMO_URI)
    throw new Error("Demo verileri yalnızca development ortamında yerel apexcari_demo veritabanına yüklenebilir.");
}

module.exports = { DEMO_URI, assertDemoTarget };
