describe("debug env", () => {
  it("prints JWT_SECRET before and after requiring server", async () => {
    console.log("BEFORE require:", process.env.JWT_SECRET);
    const app = require("../server");
    console.log("AFTER require:", process.env.JWT_SECRET);
  });
});
