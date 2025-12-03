const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: false,
      lowercase: true,
      trim: true,
    },
    phone: {
      type: String,
      required: true,
      unique: true,
    },
    password: {
      type: String,
      required: false,
      minlength: 6,
      select: false,
    },
    location: {
      city: String,
      neighborhood: String,
      coordinates: {
        type: [Number], // [longitude, latitude]
        index: "2dsphere",
      },
    },
    avatar: {
      type: String,
      default: "",
    },
    role: {
      type: String,
      enum: ["user", "admin", "artisan"],
      default: "user",
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
    crafts: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Craft",
      },
    ],
    favoriteCrafts: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Craft",
      },
    ],
  },
  {
    timestamps: true,
  }
);

// Partial unique index for email: only enforce uniqueness when a non-empty string is provided.
userSchema.index(
  { email: 1 },
  {
    unique: true,
    partialFilterExpression: { email: { $exists: true, $ne: "" } },
  }
);

// Hash password before saving — only when a password exists and was modified.
userSchema.pre("save", async function (next) {
  if (!this.password) return next();
  if (!this.isModified("password")) return next();

  try {
    const identifier = this.email || this.phone || "<unknown>";
    console.log("Hashing password for user:", identifier);
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    console.log("Password hashed successfully");
    next();
  } catch (error) {
    console.error("Error hashing password:", error);
    next(error);
  }
});

// Compare password method. If user has no password, return false.
userSchema.methods.comparePassword = async function (password) {
  if (!this.password) return false;
  return bcrypt.compare(password, this.password);
};

module.exports = mongoose.model("User", userSchema);
