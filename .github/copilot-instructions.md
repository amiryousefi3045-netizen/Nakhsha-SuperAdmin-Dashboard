# Project: Nakhsha (نخشا)

**Language:** Persian (Farsi)  
**Backend:** Node.js (Express) + MongoDB (Mongoose)  
**Frontend:** React (Next.js or React + TailwindCSS)  
**Purpose:** A Persian-language web platform showcasing Iran's handicrafts, cultural products, and local tourism experiences on an interactive map.

---

### Project Description

Nakhsha (نخشا) is a map-based marketplace and cultural platform that connects local Iranian artisans, cultural entrepreneurs, and tourists.  
The goal is to help users **discover, buy, and experience** authentic Iranian crafts and culture directly from creators, without intermediaries.

The platform includes:

- A map of Iran showing artists, craft workshops, and cultural attractions.
- User profiles for artisans and travelers.
- Product listings for handmade crafts.
- Event and tourism experience postings.
- Review and star-rating system for verified artisans.
- Persian-language UI/UX.

---

### Technical Notes

- The website is fully in **Persian (RTL)**.
- All UI texts, forms, and maps should support Persian input.
- Replace previous "Mazzemap" references with "Nakhsha".
- MongoDB collections from "Mazzemap" (food-sharing) should be renamed or migrated for cultural data.

---

### Database Migration Plan (MongoDB)

**Old Collections (Mazzemap):**

- `users`
- `foodPosts`
- `regions`
- `reviews`

**New Collections (Nakhsha):**

- `users` (same base schema, new roles)
- `artisans` (for craft sellers)
- `crafts` (for handmade items)
- `events` (for workshops or tourism spots)
- `reviews` (linked to artisans and crafts)
- `regions` (map zones across Iran)

---

### Example Mongoose Schemas

```js
// User Schema
const UserSchema = new mongoose.Schema({
  name: String,
  email: String,
  password: String,
  role: { type: String, enum: ["user", "artisan", "admin"], default: "user" },
  location: {
    city: String,
    province: String,
    coordinates: [Number], // [lng, lat]
  },
  verified: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
});

// Artisan Schema
const ArtisanSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  craftType: String, // e.g., pottery, carpet, metalwork
  bio: String,
  stars: { type: Number, default: 0 },
  verified: { type: Boolean, default: false },
  region: { type: mongoose.Schema.Types.ObjectId, ref: "Region" },
});

// Craft (Product) Schema
const CraftSchema = new mongoose.Schema({
  artisanId: { type: mongoose.Schema.Types.ObjectId, ref: "Artisan" },
  title: String,
  description: String,
  images: [String],
  price: Number,
  forSale: { type: Boolean, default: true },
  tags: [String],
  createdAt: { type: Date, default: Date.now },
});

// Event / Tourism Schema
const EventSchema = new mongoose.Schema({
  title: String,
  description: String,
  location: {
    city: String,
    coordinates: [Number],
  },
  date: Date,
  organizer: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  tags: [String],
});

---

## Branding notes for Copilot

- Always use the name "Nakhsha" (نخشا) instead of older names like "Mazzemap" or "MazeMap".
- Focus generated content and code on handicrafts, artisans, events and cultural tourism — not food/restaurants.
- UI and copy should be Persian-first (RTL). Provide English translations only when helpful.
- App name (display): "نخشا" — App identifier (ASCII): "nakhsha" or "nakhsha-frontend" / "nakhsha-backend" for packages.
- Database: consider using database name `nakhsha` or `nakhsha_db` for migrations.

```
