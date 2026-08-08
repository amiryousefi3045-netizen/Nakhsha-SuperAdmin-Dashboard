/**
 * geoValidator — Reusable geospatial query validation utilities.
 *
 * Provides validation functions for geographic data and query parameters.
 * Can be used by other services (user profiles, avatar uploads, etc.).
 *
 * Usage:
 *   const validator = require('./geoValidator');
 *   const { valid, errors, normalized } = validator.validateQueryParams(req.query);
 *   if (!valid) return res.status(400).json({ errors });
 */

class GeoValidator {
  /**
   * Validate latitude value.
   * Valid range: -90 to 90 degrees.
   *
   * @param {number|string} latitude
   * @returns {{ valid: boolean, error?: string, value?: number }}
   */
  validateLatitude(latitude) {
    if (latitude === null || latitude === undefined) {
      return {
        valid: false,
        error: "عرض جغرافیایی (latitude) الزامی است",
      };
    }

    const lat = parseFloat(latitude);

    if (Number.isNaN(lat)) {
      return {
        valid: false,
        error: "عرض جغرافیایی باید عدد معتبر باشد",
      };
    }

    if (lat < -90 || lat > 90) {
      return {
        valid: false,
        error: "عرض جغرافیایی باید بین -۹۰ و ۹۰ درجه باشد",
      };
    }

    return { valid: true, value: lat };
  }

  /**
   * Validate longitude value.
   * Valid range: -180 to 180 degrees.
   *
   * @param {number|string} longitude
   * @returns {{ valid: boolean, error?: string, value?: number }}
   */
  validateLongitude(longitude) {
    if (longitude === null || longitude === undefined) {
      return {
        valid: false,
        error: "طول جغرافیایی (longitude) الزامی است",
      };
    }

    const lng = parseFloat(longitude);

    if (Number.isNaN(lng)) {
      return {
        valid: false,
        error: "طول جغرافیایی باید عدد معتبر باشد",
      };
    }

    if (lng < -180 || lng > 180) {
      return {
        valid: false,
        error: "طول جغرافیایی باید بین -۱۸۰ و ۱۸۰ درجه باشد",
      };
    }

    return { valid: true, value: lng };
  }

  /**
   * Validate geographic coordinate pair.
   *
   * @param {number|string} latitude
   * @param {number|string} longitude
   * @returns {{ valid: boolean, errors: string[], lat?: number, lng?: number }}
   */
  validateCoordinates(latitude, longitude) {
    const errors = [];

    const latValidation = this.validateLatitude(latitude);
    if (!latValidation.valid) {
      errors.push(latValidation.error);
    }

    const lngValidation = this.validateLongitude(longitude);
    if (!lngValidation.valid) {
      errors.push(lngValidation.error);
    }

    if (errors.length > 0) {
      return { valid: false, errors };
    }

    return {
      valid: true,
      errors: [],
      lat: latValidation.value,
      lng: lngValidation.value,
    };
  }

  /**
   * Validate search radius parameter.
   *
   * @param {number|string} radiusKm
   * @param {object} options - { min: 0.1, max: 50 }
   * @returns {{ valid: boolean, error?: string, value?: number }}
   */
  validateRadius(radiusKm, options = {}) {
    const { min = 0.1, max = 50 } = options;

    if (radiusKm === null || radiusKm === undefined) {
      return {
        valid: true,
        value: 5, // Default radius
      };
    }

    const radius = parseFloat(radiusKm);

    if (Number.isNaN(radius)) {
      return {
        valid: false,
        error: "شعاع جستجو باید عدد معتبر باشد",
      };
    }

    if (radius < min) {
      return {
        valid: false,
        error: `شعاع جستجو باید حداقل ${min} کیلومتر باشد`,
      };
    }

    if (radius > max) {
      return {
        valid: false,
        error: `شعاع جستجو نباید بیشتر از ${max} کیلومتر باشد`,
      };
    }

    return { valid: true, value: radius };
  }

  /**
   * Validate pagination parameters.
   *
   * @param {number|string} limit
   * @param {number|string} skip
   * @param {object} options - { minLimit: 1, maxLimit: 500 }
   * @returns {{ valid: boolean, errors: string[], limit?: number, skip?: number }}
   */
  validatePagination(limit, skip, options = {}) {
    const { minLimit = 1, maxLimit = 500 } = options;
    const errors = [];

    const rawLimit =
      limit === undefined || limit === null || limit === ""
        ? undefined
        : parseInt(limit, 10);
    const rawSkip =
      skip === undefined || skip === null || skip === ""
        ? undefined
        : parseInt(skip, 10);

    const parsedLimit =
      rawLimit === undefined || Number.isNaN(rawLimit) ? 100 : rawLimit;
    const parsedSkip =
      rawSkip === undefined || Number.isNaN(rawSkip) ? 0 : rawSkip;

    if (parsedLimit < minLimit) {
      errors.push(`تعداد نتایج باید حداقل ${minLimit} باشد`);
    }

    if (parsedLimit > maxLimit) {
      errors.push(`تعداد نتایج نباید بیشتر از ${maxLimit} باشد`);
    }

    if (parsedSkip < 0) {
      errors.push("صفحه بندی نباید منفی باشد");
    }

    if (errors.length > 0) {
      return { valid: false, errors };
    }

    return {
      valid: true,
      errors: [],
      limit: parsedLimit,
      skip: parsedSkip,
    };
  }

  /**
   * Validate price range parameters.
   *
   * @param {number|string} minPrice
   * @param {number|string} maxPrice
   * @returns {{ valid: boolean, error?: string, min?: number, max?: number }}
   */
  validatePriceRange(minPrice, maxPrice) {
    const errors = [];

    if (minPrice === undefined && maxPrice === undefined) {
      return { valid: true, errors: [] };
    }

    const min = minPrice ? parseFloat(minPrice) : 0;
    const max = maxPrice ? parseFloat(maxPrice) : Infinity;

    if (Number.isNaN(min) || Number.isNaN(max)) {
      errors.push("محدوده قیمت باید اعداد معتبر باشند");
    }

    if (min < 0 || max < 0) {
      errors.push("قیمت نباید منفی باشد");
    }

    if (min > max) {
      errors.push("حداقل قیمت نباید بزرگتر از حداکثر قیمت باشد");
    }

    if (errors.length > 0) {
      return { valid: false, errors };
    }

    return {
      valid: true,
      errors: [],
      min: minPrice ? min : undefined,
      max: maxPrice ? max : undefined,
    };
  }

  /**
   * Validate enum field (category, type, status, etc.).
   *
   * @param {string} value
   * @param {array} allowedValues
   * @param {string} fieldName - For error messages
   * @returns {{ valid: boolean, error?: string }}
   */
  validateEnum(value, allowedValues, fieldName = "field") {
    if (!value) {
      return { valid: true }; // Optional field
    }

    if (!allowedValues.includes(value)) {
      return {
        valid: false,
        error: `${fieldName} باید یکی از: ${allowedValues.join(", ")} باشد`,
      };
    }

    return { valid: true };
  }

  /**
   * Validate rating value.
   *
   * @param {number|string} rating
   * @returns {{ valid: boolean, error?: string, value?: number }}
   */
  validateRating(rating) {
    if (rating === undefined || rating === null) {
      return { valid: true }; // Optional
    }

    const rate = parseFloat(rating);

    if (Number.isNaN(rate)) {
      return {
        valid: false,
        error: "امتیاز باید عدد معتبر باشد",
      };
    }

    if (rate < 0 || rate > 5) {
      return {
        valid: false,
        error: "امتیاز باید بین ۰ و ۵ باشد",
      };
    }

    return { valid: true, value: rate };
  }

  /**
   * Validate text search query.
   *
   * @param {string} query
   * @param {object} options - { maxLength: 200, allowRegex: false }
   * @returns {{ valid: boolean, error?: string, value?: string }}
   */
  validateTextQuery(query, options = {}) {
    const { maxLength = 200, allowRegex = false } = options;

    if (!query) {
      return { valid: true }; // Optional
    }

    if (typeof query !== "string") {
      return {
        valid: false,
        error: "متن جستجو باید رشته معتبر باشد",
      };
    }

    if (query.length > maxLength) {
      return {
        valid: false,
        error: `متن جستجو نباید بیشتر از ${maxLength} کاراکتر باشد`,
      };
    }

    // Block regex injection if not allowed
    if (!allowRegex && /[.*+?^${}()|[\]\\]/.test(query)) {
      return {
        valid: false,
        error: "متن جستجو حاوی کاراکتر‌های نامعتبر است",
      };
    }

    return { valid: true, value: query.trim() };
  }

  /**
   * Validate ObjectId (MongoDB).
   *
   * @param {string|ObjectId} id
   * @returns {{ valid: boolean, error?: string, value?: ObjectId }}
   */
  validateObjectId(id) {
    const mongoose = require("mongoose");

    if (!id) {
      return { valid: true }; // Optional
    }

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return {
        valid: false,
        error: "شناسه نامعتبر است",
      };
    }

    return {
      valid: true,
      value: new mongoose.Types.ObjectId(id),
    };
  }

  /**
   * Comprehensive validation of all geospatial query parameters.
   * Returns normalized/validated parameters ready for database queries.
   *
   * @param {object} params - Query parameters
   * @returns {{
   *   valid: boolean,
   *   errors: string[],
   *   normalized?: {
   *     lat, lng, radiusKm, limit, skip,
   *     category, type, status,
   *     minPrice, maxPrice,
   *     owner, minRating,
   *     query, verified
   *   }
   * }}
   */
  validateQueryParams(params) {
    const errors = [];
    const normalized = {};

    // Coordinates (required)
    if (!params.lat || !params.lng) {
      errors.push("مختصات جغرافیایی (lat, lng) الزامی هستند");
    } else {
      const coordValidation = this.validateCoordinates(params.lat, params.lng);
      if (!coordValidation.valid) {
        errors.push(...coordValidation.errors);
      } else {
        normalized.lat = coordValidation.lat;
        normalized.lng = coordValidation.lng;
      }
    }

    // Radius
    const radiusValidation = this.validateRadius(params.radiusKm);
    if (!radiusValidation.valid) {
      errors.push(radiusValidation.error);
    } else {
      normalized.radiusKm = radiusValidation.value;
    }

    // Pagination
    const pagValidation = this.validatePagination(params.limit, params.skip);
    if (!pagValidation.valid) {
      errors.push(...pagValidation.errors);
    } else {
      normalized.limit = pagValidation.limit;
      normalized.skip = pagValidation.skip;
    }

    // Category (optional)
    if (params.category) {
      normalized.category = params.category;
    }

    // Type (optional, validate enum)
    if (params.type) {
      const typeValidation = this.validateEnum(
        params.type,
        ["post", "tour", "training", "academy"],
        "نوع لیست",
      );
      if (!typeValidation.valid) {
        errors.push(typeValidation.error);
      } else {
        normalized.type = params.type;
      }
    }

    // Status (optional, validate enum)
    if (params.status) {
      const statusValidation = this.validateEnum(
        params.status,
        ["draft", "published", "archived"],
        "وضعیت",
      );
      if (!statusValidation.valid) {
        errors.push(statusValidation.error);
      } else {
        normalized.status = params.status;
      }
    } else {
      normalized.status = "published";
    }

    // Price range (optional)
    if (params.minPrice !== undefined || params.maxPrice !== undefined) {
      const priceValidation = this.validatePriceRange(
        params.minPrice,
        params.maxPrice,
      );
      if (!priceValidation.valid) {
        errors.push(...priceValidation.errors);
      } else {
        if (priceValidation.min !== undefined)
          normalized.minPrice = priceValidation.min;
        if (priceValidation.max !== undefined)
          normalized.maxPrice = priceValidation.max;
      }
    }

    // Owner (optional, validate ObjectId)
    if (params.owner) {
      const ownerValidation = this.validateObjectId(params.owner);
      if (!ownerValidation.valid) {
        errors.push(ownerValidation.error);
      } else {
        normalized.owner = ownerValidation.value;
      }
    }

    // Rating (optional)
    if (params.minRating !== undefined) {
      const ratingValidation = this.validateRating(params.minRating);
      if (!ratingValidation.valid) {
        errors.push(ratingValidation.error);
      } else {
        normalized.minRating = ratingValidation.value;
      }
    }

    // Text query (optional)
    if (params.query) {
      const queryValidation = this.validateTextQuery(params.query);
      if (!queryValidation.valid) {
        errors.push(queryValidation.error);
      } else {
        normalized.query = queryValidation.value;
      }
    }

    // Verified filter (optional)
    if (params.verified !== undefined) {
      normalized.verified =
        params.verified === "true" || params.verified === true;
    }

    if (errors.length > 0) {
      return { valid: false, errors };
    }

    return {
      valid: true,
      errors: [],
      normalized,
    };
  }
}

module.exports = new GeoValidator();
