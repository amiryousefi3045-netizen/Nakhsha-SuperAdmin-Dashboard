const mongoose = require("mongoose");
const express = require("express");
const router = express.Router();
const Craft = require("../models/Craft");
const { isValidCoordinates } = require("../utils/geospatial");

/**
 * GET /api/listings/near
 * Find listings near a point with optional filters
 * Query params:
 * - lng: longitude (-180 to 180)
 * - lat: latitude (-90 to 90)
 * - radiusKm: search radius in kilometers (default: 10)
 * - q: text search
 * - kind: filter by listing type
 * - minPrice: minimum price
 * - maxPrice: maximum price
 * - sort: distance (default), -createdAt, price, -price
 * - page: pagination page (default: 1)
 * - limit: items per page (default: 20)
 */
router.get("/near", async (req, res) => {
  try {
    const {
      lng,
      lat,
      radiusKm = 10,
      q,
      kind,
      minPrice,
      maxPrice,
      sort = "distance",
      page = 1,
      limit = 20,
    } = req.query;

    // Parse coordinates and validate
    const longitude = parseFloat(lng);
    const latitude = parseFloat(lat);

    // Validate coordinates
    if (
      !isValidCoordinates(longitude, latitude) &&
      (lng !== undefined || lat !== undefined)
    ) {
      return res.status(400).json({
        message: "مختصات جغرافیایی نامعتبر است",
        error: "lng باید بین -180 تا 180 و lat باید بین -90 تا 90 باشد",
      });
    }

    const radius = Math.min(Math.max(1, parseFloat(radiusKm)), 100); // Limit radius between 1-100km
    const skip = (Math.max(1, parseInt(page)) - 1) * parseInt(limit);

    // Build base query
    let query = { isPublished: true };

    // Add filters if provided
    if (kind) query.kind = kind;
    if (minPrice !== undefined) query.price = { $gte: parseFloat(minPrice) };
    if (maxPrice !== undefined) {
      query.price = { ...(query.price || {}), $lte: parseFloat(maxPrice) };
    }
    if (q) {
      query.$text = { $search: q };
    }

    let results;

    // Use $geoNear if coordinates are valid
    if (isValidCoordinates(longitude, latitude)) {
      const geoNearPipeline = [
        {
          $geoNear: {
            near: {
              type: "Point",
              coordinates: [longitude, latitude],
            },
            key: "location.geometry",
            distanceField: "distanceMeters",
            maxDistance: radius * 1000, // Convert km to meters
            spherical: true,
            query: query,
          },
        },
      ];

      // Add text search if needed (after $geoNear)
      if (q) {
        geoNearPipeline.push({
          $match: { $text: { $search: q } },
        });
      }

      // Add sorting
      if (sort === "-createdAt") {
        geoNearPipeline.push({ $sort: { createdAt: -1 } });
      } else if (sort === "price") {
        geoNearPipeline.push({ $sort: { price: 1 } });
      } else if (sort === "-price") {
        geoNearPipeline.push({ $sort: { price: -1 } });
      }
      // Default sort is by distance (already handled by $geoNear)

      // Add pagination
      geoNearPipeline.push(
        { $skip: skip },
        { $limit: parseInt(limit) },
        // Lookup author details
        {
          $lookup: {
            from: "users",
            localField: "author",
            foreignField: "_id",
            as: "author",
          },
        },
        { $unwind: "$author" },
        // Project only needed fields
        {
          $project: {
            _id: 1,
            title: 1,
            description: 1,
            images: 1,
            kind: 1,
            price: 1,
            currency: 1,
            forSale: 1,
            tags: 1,
            schedule: 1,
            location: 1,
            distanceMeters: 1,
            createdAt: 1,
            "author._id": 1,
            "author.name": 1,
            averageRating: 1,
            totalLikes: 1,
          },
        },
      );

      // Execute pipeline
      results = await Craft.aggregate(geoNearPipeline);

      // Convert distance to kilometers for response
      results = results.map((item) => ({
        ...item,
        distanceKm: (item.distanceMeters / 1000).toFixed(1),
      }));
    } else {
      // Fallback to regular search when no coordinates
      const sortOptions = {
        "-createdAt": { createdAt: -1 },
        price: { price: 1 },
        "-price": { price: -1 },
      };

      results = await Craft.find(query)
        .sort(sortOptions[sort] || { createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .populate("author", "name")
        .select("-comments -likes -dislikes");
    }

    // Get total count for pagination
    const total = await Craft.countDocuments(query);

    res.json({
      items: results,
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      hasMore: skip + results.length < total,
    });
  } catch (error) {
    console.error("Error in /listings/near:", error);
    res.status(500).json({
      message: "خطا در جستجوی نزدیک‌ترین موارد",
      error: error.message,
    });
  }
});

module.exports = router;
