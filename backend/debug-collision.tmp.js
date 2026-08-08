const mongoose = require("mongoose");
mongoose.connect("mongodb://127.0.0.1:27017/nakhsha_test_collision").then(async () => {
  try {
    const baseA = mongoose.model("BaseA", new mongoose.Schema({ a: String }, { discriminatorKey: "type" }));
    const baseB = mongoose.model("BaseB", new mongoose.Schema({ b: String }, { discriminatorKey: "type" }));
    baseA.discriminator("post", new mongoose.Schema({ price: Number }));
    baseB.discriminator("post", new mongoose.Schema({ startDate: Date }));
    const m = mongoose.model("post");
    console.log("model('post').base:", m.base.modelName, "| base.modelNames:", Object.keys(m.base.models));
    console.log("model('post') has price? :", "price" in m.schema.paths);
    console.log("model('post') has startDate? :", "startDate" in m.schema.paths);
  } catch (e) {
    console.log("ERROR:", e.message);
  }
  await mongoose.disconnect();
  process.exit(0);
});
