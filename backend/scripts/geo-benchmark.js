/**
 * geo-benchmark.js — Geospatial query performance benchmarking script.
 *
 * Measures query execution time, memory usage, and index efficiency.
 * Generates benchmark report saved to Document/GEOSPATIAL_PERFORMANCE_BENCHMARK.md
 *
 * Usage:
 *   BENCHMARK_SIZE=small node scripts/geo-benchmark.js
 *   BENCHMARK_SIZE=medium node scripts/geo-benchmark.js (default)
 *   BENCHMARK_SIZE=large node scripts/geo-benchmark.js
 *
 * Environment Variables:
 *   BENCHMARK_SIZE: 'small' | 'medium' | 'large' (default 'medium')
 *   MONGODB_URI: MongoDB connection string (uses env or defaults to local)
 */

const mongoose = require("mongoose");
const path = require("path");
const fs = require("fs");
const { Listing } = require("../models/Listing");
const GeoService = require("../services/GeoService");

// Configuration
const BENCHMARK_SIZE = process.env.BENCHMARK_SIZE || "medium";
const MONGODB_URI =
  process.env.MONGODB_URI || "mongodb://localhost:27017/nakhsha_test";

const DATASET_SIZES = {
  small: 100,
  medium: 1000,
  large: 10000,
};

const DATASET_SIZE = DATASET_SIZES[BENCHMARK_SIZE] || DATASET_SIZES.medium;

// Benchmark results collector
const results = {
  timestamp: new Date().toISOString(),
  benchmarkSize: BENCHMARK_SIZE,
  datasetSize: DATASET_SIZE,
  environment: {
    nodeVersion: process.version,
    mongodbUri: MONGODB_URI.replace(
      /([^:]*:\/\/)([^:]*):([^@]*)@/,
      "$1***:***@",
    ),
    memoryBefore: 0,
    memoryAfter: 0,
  },
  tests: [],
};

// Helper: Generate mock listing data
function generateMockListings(count, index) {
  const listings = [];
  const cities = [
    "تهران",
    "مشهد",
    "اصفهان",
    "تبریز",
    "شیراز",
    "اهواز",
    "کرج",
    "بیرجند",
  ];
  const provinces = [
    "تهران",
    "خراسان رضوی",
    "اصفهان",
    "آذربایجان شرقی",
    "فارس",
    "خوزستان",
    "البرز",
    "خراسان جنوبی",
  ];
  const categories = [
    "pottery",
    "carpet",
    "metalwork",
    "calligraphy",
    "textiles",
  ];
  const types = ["post", "tour", "training", "academy"];

  for (let i = 0; i < count; i++) {
    // Generate random location within Iran (roughly 25-40N, 44-61E)
    const lat = 25 + Math.random() * 15;
    const lng = 44 + Math.random() * 17;
    const cityIdx = i % cities.length;

    listings.push({
      title: `محصول ${index * count + i}`,
      description: `توضیحات برای محصول ${index * count + i} - این یک توضیح طولانی است که برای تست جستجوی متن استفاده می‌شود`,
      location: {
        type: "Point",
        coordinates: [lng, lat],
        city: cities[cityIdx],
        province: provinces[cityIdx],
        district: `منطقه ${i % 10}`,
        address: `خیابان ${i}، پلاک ${i}`,
      },
      owner: new mongoose.Types.ObjectId(),
      status: "published",
      type: types[i % types.length],
      category: categories[i % categories.length],
      price: Math.floor(Math.random() * 5000000),
      tags: [categories[i % categories.length], "handmade", "traditional"],
      images: [],
      rating: Math.random() * 5,
      verified: Math.random() > 0.3,
    });
  }

  return listings;
}

// Benchmark runner
async function runBenchmarks() {
  console.log(`\n${"=".repeat(70)}`);
  console.log(`Nakhsha Geospatial Performance Benchmark`);
  console.log(`${"=".repeat(70)}`);
  console.log(
    `Dataset Size: ${BENCHMARK_SIZE.toUpperCase()} (${DATASET_SIZE} documents)`,
  );
  console.log(`\nConnecting to MongoDB...`);

  try {
    // Connect to MongoDB
    await mongoose.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log("✓ Connected to MongoDB");

    // Clear test data
    console.log("\nPreparing test data...");
    await Listing.deleteMany({});

    // Record memory before data insertion
    results.environment.memoryBefore =
      process.memoryUsage().heapUsed / 1024 / 1024;
    console.log(
      `  Memory before: ${results.environment.memoryBefore.toFixed(2)} MB`,
    );

    // Insert test data in batches
    const batchSize = 100;
    const batches = Math.ceil(DATASET_SIZE / batchSize);
    for (let b = 0; b < batches; b++) {
      const count = Math.min(batchSize, DATASET_SIZE - b * batchSize);
      const data = generateMockListings(count, b);
      await Listing.insertMany(data);
      process.stdout.write(
        `\r  Inserted ${Math.min((b + 1) * batchSize, DATASET_SIZE)}/${DATASET_SIZE} documents`,
      );
    }
    console.log(" ✓");

    // Verify indexes
    console.log("\nVerifying indexes...");
    const indexes = await Listing.collection.getIndexes();
    console.log(`  Found ${Object.keys(indexes).length} indexes`);

    // Test 1: Near query with default parameters
    console.log("\n--- Test 1: /api/listings/near (basic) ---");
    const test1Start = Date.now();
    const test1Result = await GeoService.findNearbyListings(35.6892, 51.389, 5);
    const test1Time = Date.now() - test1Start;
    console.log(`  Execution time: ${test1Time} ms`);
    console.log(`  Results found: ${test1Result.data.length}`);
    results.tests.push({
      name: "near_basic",
      description: "Basic near query (5km radius)",
      executionTime: test1Time,
      resultCount: test1Result.data.length,
      status: test1Result.success ? "pass" : "fail",
    });

    // Test 2: Near query with filters
    console.log("\n--- Test 2: /api/listings/near (with filters) ---");
    const test2Start = Date.now();
    const test2Result = await GeoService.findNearbyListings(
      35.6892,
      51.389,
      5,
      { category: "pottery", minPrice: 100000, maxPrice: 3000000 },
    );
    const test2Time = Date.now() - test2Start;
    console.log(`  Execution time: ${test2Time} ms`);
    console.log(`  Results found: ${test2Result.data.length}`);
    results.tests.push({
      name: "near_filtered",
      description: "Near query with category and price filters",
      executionTime: test2Time,
      resultCount: test2Result.data.length,
      status: test2Result.success ? "pass" : "fail",
    });

    // Test 3: Near query with pagination
    console.log("\n--- Test 3: /api/listings/near (pagination) ---");
    const test3Start = Date.now();
    const test3Result = await GeoService.findNearbyListings(
      35.6892,
      51.389,
      5,
      {},
      { limit: 50, skip: 0 },
    );
    const test3Time = Date.now() - test3Start;
    console.log(`  Execution time: ${test3Time} ms`);
    console.log(`  Results found: ${test3Result.data.length}`);
    results.tests.push({
      name: "near_pagination",
      description: "Near query with pagination (limit=50)",
      executionTime: test3Time,
      resultCount: test3Result.data.length,
      status: test3Result.success ? "pass" : "fail",
    });

    // Test 4: Large radius query
    console.log("\n--- Test 4: /api/listings/near (large radius) ---");
    const test4Start = Date.now();
    const test4Result = await GeoService.findNearbyListings(
      35.6892,
      51.389,
      30,
      {},
      { limit: 100 },
    );
    const test4Time = Date.now() - test4Start;
    console.log(`  Execution time: ${test4Time} ms`);
    console.log(`  Results found: ${test4Result.data.length}`);
    results.tests.push({
      name: "near_large_radius",
      description: "Near query with large radius (30km)",
      executionTime: test4Time,
      resultCount: test4Result.data.length,
      status: test4Result.success ? "pass" : "fail",
    });

    // Test 5: Heatmap generation
    console.log("\n--- Test 5: /api/listings/heatmap ---");
    const test5Start = Date.now();
    const test5Result = await GeoService.generateHeatmapData(
      35.6892,
      51.389,
      10,
      {},
      { gridSize: 10, aggregateBy: "count" },
    );
    const test5Time = Date.now() - test5Start;
    console.log(`  Execution time: ${test5Time} ms`);
    console.log(`  Grid cells: ${test5Result.data?.grid?.length || 0}`);
    results.tests.push({
      name: "heatmap_basic",
      description: "Heatmap generation (10km radius, 10x10 grid)",
      executionTime: test5Time,
      resultCount: test5Result.data?.grid?.length || 0,
      status: test5Result.success ? "pass" : "fail",
    });

    // Test 6: Heatmap with detailed aggregation
    console.log("\n--- Test 6: /api/listings/heatmap (with details) ---");
    const test6Start = Date.now();
    const test6Result = await GeoService.generateHeatmapData(
      35.6892,
      51.389,
      10,
      {},
      { gridSize: 10, aggregateBy: "avgPrice", includeDetails: true },
    );
    const test6Time = Date.now() - test6Start;
    console.log(`  Execution time: ${test6Time} ms`);
    console.log(`  Grid cells: ${test6Result.data?.grid?.length || 0}`);
    results.tests.push({
      name: "heatmap_detailed",
      description: "Heatmap with detailed stats (avgPrice with min/max)",
      executionTime: test6Time,
      resultCount: test6Result.data?.grid?.length || 0,
      status: test6Result.success ? "pass" : "fail",
    });

    // Test 7: Clustering
    console.log("\n--- Test 7: /api/listings/clusters ---");
    const test7Start = Date.now();
    const test7Result = await GeoService.clusterNearbyByGeohash(
      35.6892,
      51.389,
      10,
      {},
      { zoomLevel: 12 },
    );
    const test7Time = Date.now() - test7Start;
    console.log(`  Execution time: ${test7Time} ms`);
    console.log(`  Clusters: ${test7Result.data?.clusters?.length || 0}`);
    results.tests.push({
      name: "clustering_zoom12",
      description: "Clustering at zoom level 12 (city level)",
      executionTime: test7Time,
      resultCount: test7Result.data?.clusters?.length || 0,
      status: test7Result.success ? "pass" : "fail",
    });

    // Test 8: Clustering at different zoom levels
    console.log(
      "\n--- Test 8: /api/listings/clusters (various zoom levels) ---",
    );
    const zoomLevels = [0, 5, 10, 15, 20];
    for (const zoom of zoomLevels) {
      const testStart = Date.now();
      const testResult = await GeoService.clusterNearbyByGeohash(
        35.6892,
        51.389,
        10,
        {},
        { zoomLevel: zoom },
      );
      const testTime = Date.now() - testStart;
      console.log(
        `  Zoom ${zoom.toString().padStart(2)}: ${testTime.toString().padStart(4)} ms, clusters: ${testResult.data?.clusters?.length || 0}`,
      );
      results.tests.push({
        name: `clustering_zoom${zoom}`,
        description: `Clustering at zoom level ${zoom}`,
        executionTime: testTime,
        resultCount: testResult.data?.clusters?.length || 0,
        status: testResult.success ? "pass" : "fail",
      });
    }

    // Test 9: Polygon search
    console.log("\n--- Test 9: /api/listings/within-boundary ---");
    const polygon = [
      [51.0, 35.4],
      [51.8, 35.4],
      [51.8, 35.9],
      [51.0, 35.9],
      [51.0, 35.4],
    ];
    const test9Start = Date.now();
    const test9Result = await GeoService.findWithinPolygon(polygon, {});
    const test9Time = Date.now() - test9Start;
    console.log(`  Execution time: ${test9Time} ms`);
    console.log(`  Results found: ${test9Result.data?.items?.length || 0}`);
    results.tests.push({
      name: "polygon_search",
      description: "Polygon search (5-point boundary)",
      executionTime: test9Time,
      resultCount: test9Result.data?.items?.length || 0,
      status: test9Result.success ? "pass" : "fail",
    });

    // Record final memory
    results.environment.memoryAfter =
      process.memoryUsage().heapUsed / 1024 / 1024;
    console.log(
      `\n  Memory after: ${results.environment.memoryAfter.toFixed(2)} MB`,
    );
    console.log(
      `  Memory delta: ${(results.environment.memoryAfter - results.environment.memoryBefore).toFixed(2)} MB`,
    );

    // Generate report
    generateReport(results);

    console.log("\n" + "=".repeat(70));
    console.log("Benchmark completed successfully!");
    console.log("=".repeat(70) + "\n");
  } catch (error) {
    console.error("\n✗ Benchmark failed:", error.message);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
  }
}

function generateReport(results) {
  const reportPath = path.join(
    __dirname,
    "../Document/GEOSPATIAL_PERFORMANCE_BENCHMARK.md",
  );

  const report = `# Geospatial Performance Benchmark Report

**Generated:** ${new Date(results.timestamp).toLocaleString()}  
**Benchmark Size:** ${results.benchmarkSize.toUpperCase()}  
**Dataset Size:** ${results.datasetSize} documents  

## Environment

- **Node.js Version:** ${results.environment.nodeVersion}
- **MongoDB URI:** ${results.environment.mongodbUri}
- **Memory Before:** ${results.environment.memoryBefore.toFixed(2)} MB
- **Memory After:** ${results.environment.memoryAfter.toFixed(2)} MB
- **Memory Delta:** ${(results.environment.memoryAfter - results.environment.memoryBefore).toFixed(2)} MB

## Test Results

| Test | Description | Execution Time (ms) | Results | Status |
|------|-------------|---------------------|---------|--------|
${results.tests
  .map(
    (test) =>
      `| ${test.name} | ${test.description} | ${test.executionTime} | ${test.resultCount} | ${test.status === "pass" ? "✓ PASS" : "✗ FAIL"} |`,
  )
  .join("\n")}

## Performance Analysis

### Summary Statistics

${(() => {
  const times = results.tests.map((t) => t.executionTime);
  const avg = times.reduce((a, b) => a + b, 0) / times.length;
  const min = Math.min(...times);
  const max = Math.max(...times);
  return `
- **Average Execution Time:** ${avg.toFixed(2)} ms
- **Min Execution Time:** ${min} ms
- **Max Execution Time:** ${max} ms
- **Total Tests:** ${results.tests.length}
- **Passed:** ${results.tests.filter((t) => t.status === "pass").length}
- **Failed:** ${results.tests.filter((t) => t.status === "fail").length}
`;
})()}

### Performance Targets (SLOs)

| Endpoint | Target | Result | Status |
|----------|--------|--------|--------|
| /api/listings/near (basic, <100 results) | < 200ms | ${results.tests.find((t) => t.name === "near_basic")?.executionTime}ms | ${results.tests.find((t) => t.name === "near_basic")?.executionTime < 200 ? "✓" : "✗"} |
| /api/listings/near (filtered) | < 250ms | ${results.tests.find((t) => t.name === "near_filtered")?.executionTime}ms | ${results.tests.find((t) => t.name === "near_filtered")?.executionTime < 250 ? "✓" : "✗"} |
| /api/listings/heatmap (10x10 grid) | < 500ms | ${results.tests.find((t) => t.name === "heatmap_basic")?.executionTime}ms | ${results.tests.find((t) => t.name === "heatmap_basic")?.executionTime < 500 ? "✓" : "✗"} |
| /api/listings/clusters (any zoom) | < 300ms | ${Math.max(...results.tests.filter((t) => t.name.includes("clustering")).map((t) => t.executionTime))}ms | ${Math.max(...results.tests.filter((t) => t.name.includes("clustering")).map((t) => t.executionTime)) < 300 ? "✓" : "✗"} |
| /api/listings/within-boundary | < 400ms | ${results.tests.find((t) => t.name === "polygon_search")?.executionTime}ms | ${results.tests.find((t) => t.name === "polygon_search")?.executionTime < 400 ? "✓" : "✗"} |

## Recommendations

${(() => {
  const slowTests = results.tests.filter((t) => t.executionTime > 300);
  if (slowTests.length === 0) {
    return "✓ All queries are performing within acceptable parameters.";
  }

  return `⚠️ The following queries may need optimization:\n\n${slowTests.map((t) => `- **${t.description}**: ${t.executionTime}ms`).join("\n")}`;
})()}

## Index Verification

Ensure the following indexes exist on the \`user_listings\` collection:

\`\`\`javascript
// Geospatial indexes
db.user_listings.createIndex({ "location.coordinates": "2dsphere" }, { sparse: true })
db.user_listings.createIndex({ "location.coordinates": "2dsphere", category: 1 }, { sparse: true })
db.user_listings.createIndex({ "location.coordinates": "2dsphere", type: 1, status: 1 }, { sparse: true })
db.user_listings.createIndex({ "location.coordinates": "2dsphere", price: 1, status: 1 }, { sparse: true })

// Text search index
db.user_listings.createIndex({ title: "text", description: "text", tags: "text" }, { weights: { title: 10, tags: 5, description: 1 } })

// Location filtering
db.user_listings.createIndex({ "location.city": 1, "location.province": 1, createdAt: -1 }, { sparse: true })
\`\`\`

---

*Generated by Nakhsha Geospatial Benchmarking Suite*
`;

  fs.writeFileSync(reportPath, report);
  console.log(`\n✓ Report saved to: ${reportPath}`);
}

// Run benchmarks
runBenchmarks().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
