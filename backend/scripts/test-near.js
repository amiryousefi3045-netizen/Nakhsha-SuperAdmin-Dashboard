#!/usr/bin/env node

/**
 * Test script for /api/crafts/near endpoint
 * Requires: Backend running on localhost:5000, sample data seeded
 * Usage: node scripts/test-near.js
 */

const axios = require("axios");

const BASE_URL = process.env.API_URL || "http://localhost:5000/api";

const testCases = [
  {
    name: "Query crafts near Tehran (51.41, 35.73)",
    params: {
      lng: 51.41,
      lat: 35.73,
      radiusKm: 10,
    },
  },
  {
    name: "Query pottery crafts within 20km of Isfahan",
    params: {
      lng: 51.67,
      lat: 32.64,
      category: "pottery",
      radiusKm: 20,
    },
  },
  {
    name: "Search for 'سفال' (pottery) within 15km",
    params: {
      lng: 51.41,
      lat: 35.73,
      q: "سفال",
      radiusKm: 15,
    },
  },
  {
    name: "Price range filter (500k-1M) within 10km",
    params: {
      lng: 51.41,
      lat: 35.73,
      min: 500000,
      max: 1000000,
      radiusKm: 10,
    },
  },
  {
    name: "Fallback: Text search without coordinates",
    params: {
      q: "دست‌ساز",
    },
  },
];

async function runTests() {
  console.log(`\n🧪 Testing /api/crafts/near endpoint\n`);
  console.log(`Base URL: ${BASE_URL}\n`);

  let passed = 0;
  let failed = 0;

  for (const testCase of testCases) {
    try {
      console.log(`📝 Test: ${testCase.name}`);
      console.log(`   Params: ${JSON.stringify(testCase.params)}`);

      const response = await axios.get(`${BASE_URL}/crafts/near`, {
        params: testCase.params,
        timeout: 10000,
      });

      const { items } = response.data;
      console.log(`   ✅ Status: ${response.status}`);
      console.log(
        `   📊 Results: ${items.length} items${
          items.length > 0 && items[0].distanceMeters
            ? ` (closest: ${items[0].distanceMeters}m)`
            : ""
        }`
      );

      // Validate response structure
      if (Array.isArray(items)) {
        const sample = items[0];
        if (
          sample &&
          sample.id &&
          sample.title &&
          (sample.distanceMeters !== undefined || !testCase.params.lng)
        ) {
          console.log(`   ✓ Response structure valid\n`);
          passed++;
        } else {
          console.log(`   ✗ Response structure invalid (missing fields)\n`);
          failed++;
        }
      } else {
        console.log(`   ✗ Response is not an array\n`);
        failed++;
      }
    } catch (err) {
      console.log(`   ❌ Error: ${err.message}`);
      if (err.response?.data?.message) {
        console.log(`   Details: ${err.response.data.message}\n`);
      } else {
        console.log(
          `   (Is backend running on ${BASE_URL.split("/api")[0]}?)\n`
        );
      }
      failed++;
    }
  }

  console.log(`\n📋 Summary: ${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
