describe("debug env", () => {
  it("prints env at start", async () => {
    console.log("START JWT_SECRET:", process.env.JWT_SECRET);
    console.log("START NODE_ENV:", process.env.NODE_ENV);
    console.log("START MONGODB_URI:", process.env.MONGODB_URI);
  });
});
