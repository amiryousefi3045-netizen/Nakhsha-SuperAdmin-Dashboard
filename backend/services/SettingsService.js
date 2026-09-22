/**
 * Seller Settings & Team domain service.
 *
 * Two surfaces:
 *   1. Store settings — owner-writable preferences stored on SellerProfile.settings.
 *      `defaultPayoutMethod` is honored by FinanceService.requestPayout when the
 *      seller omits a method on a payout request.
 *   2. Team roster — TeamMember documents owned by a store. The store owner is
 *      implicit (the SellerProfile.userId). Inviting a user upgrades a plain
 *      "user" to the platform "seller" role so they can pass the dashboard's
 *      requireRole("seller"); manager/staff capability gating lives in the
 *      routes/middleware layer (requireOwnerOnly / requireManagerOrOwner).
 */

const mongoose = require("mongoose");
const User = require("../models/User");
const SellerProfile = require("../models/SellerProfile");
const TeamMember = require("../models/TeamMember");
const Payout = require("../models/Payout");

const PAYOUT_METHODS = Payout.PAYOUT_METHODS;

const SETTINGS_DEFAULTS = {
  storefrontPublished: false,
  notificationEmail: true,
  notificationSms: false,
  defaultPayoutMethod: "bank_transfer",
};

const SETTINGS_KEYS = Object.keys(SETTINGS_DEFAULTS);
const IRANIAN_PHONE = /^09\d{9}$/;

class SettingsDomainError extends Error {
  constructor(code, message, details = null) {
    super(message);
    this.name = "SettingsDomainError";
    this.code = code;
    this.details = details;
  }
}

function settingsDTO(profile) {
  return { ...SETTINGS_DEFAULTS, ...(profile?.settings || {}) };
}

function teamMemberToDTO(member, user) {
  return {
    id: String(member._id),
    userId: String(member.userId),
    role: member.role,
    note: member.note || "",
    name: user?.name || "",
    phone: user?.phone || "",
    createdAt: member.createdAt,
    updatedAt: member.updatedAt,
  };
}

// ── Settings ────────────────────────────────────────────────────────────────

async function getSettings(sellerId) {
  const profile = await SellerProfile.findById(sellerId).select("settings").lean();
  return settingsDTO(profile);
}

function normalizeSettings(updates) {
  const clean = {};
  const payload = updates || {};
  if (payload.storefrontPublished !== undefined) {
    clean.storefrontPublished = Boolean(payload.storefrontPublished);
  }
  if (payload.notificationEmail !== undefined) {
    clean.notificationEmail = Boolean(payload.notificationEmail);
  }
  if (payload.notificationSms !== undefined) {
    clean.notificationSms = Boolean(payload.notificationSms);
  }
  if (payload.defaultPayoutMethod !== undefined) {
    if (!PAYOUT_METHODS.includes(payload.defaultPayoutMethod)) {
      throw new SettingsDomainError(
        "VALIDATION_ERROR",
        "روش پیش‌فرض تسویه نامعتبر است",
        { field: "defaultPayoutMethod" },
      );
    }
    clean.defaultPayoutMethod = payload.defaultPayoutMethod;
  }
  return clean;
}

async function updateSettings(sellerId, updates) {
  const clean = normalizeSettings(updates);
  const keys = Object.keys(clean);
  if (keys.length === 0) {
    throw new SettingsDomainError(
      "VALIDATION_ERROR",
      "حداقل یک تنظیم برای به‌روزرسانی ارسال کنید",
      { field: "settings" },
    );
  }

  const set = {};
  for (const key of keys) set[`settings.${key}`] = clean[key];

  const profile = await SellerProfile.findByIdAndUpdate(
    sellerId,
    { $set: set },
    { new: true, runValidators: true },
  )
    .select("settings")
    .lean();

  return settingsDTO(profile);
}

// ── Team roster ─────────────────────────────────────────────────────────────

async function listTeam(sellerId) {
  const [members, total] = await Promise.all([
    TeamMember.find({ sellerProfileId: sellerId }).sort({ createdAt: -1 }),
    TeamMember.countDocuments({ sellerProfileId: sellerId }),
  ]);

  const userIds = members.map((m) => m.userId);
  const users = userIds.length
    ? await User.find({ _id: { $in: userIds } }).select("name phone").lean()
    : [];
  const byId = new Map(users.map((u) => [String(u._id), u]));

  const profile = await SellerProfile.findById(sellerId).select("userId").lean();
  const ownerUser = profile
    ? await User.findById(profile.userId).select("name phone").lean()
    : null;

  return {
    items: members.map((m) => teamMemberToDTO(m, byId.get(String(m.userId)))),
    total,
    owner: ownerUser
      ? {
          userId: String(ownerUser._id),
          name: ownerUser.name || "",
          phone: ownerUser.phone || "",
        }
      : null,
  };
}

async function inviteTeam({ sellerId, ownerUserId, phone, role, note }) {
  const normalizedPhone = String(phone || "").replace(/\D/g, "");
  if (!IRANIAN_PHONE.test(normalizedPhone)) {
    throw new SettingsDomainError(
      "VALIDATION_ERROR",
      "شماره موبایل معتبر نیست",
      { field: "phone" },
    );
  }

  const targetRole = TeamMember.TEAM_ROLES.includes(role) ? role : "staff";

  const user = await User.findOne({
    $or: [{ phone: normalizedPhone }, { phone }],
  }).lean();
  if (!user) {
    throw new SettingsDomainError(
      "TEAM_MEMBER_USER_NOT_FOUND",
      "کاربری با این شماره موبایل در پلتفرم وجود ندارد",
      { field: "phone" },
    );
  }
  if (String(user._id) === String(ownerUserId)) {
    throw new SettingsDomainError(
      "TEAM_MEMBER_SELF_INVITE",
      "مالک فروشگاه نمی‌تواند عضو تیم خودش باشد",
      null,
    );
  }
  if (user.role === "admin" || user.role === "super_admin") {
    throw new SettingsDomainError(
      "TEAM_MEMBER_INVALID_USER",
      "کاربران مدیریتی نمی‌توانند عضو تیم فروشگاه شوند",
      null,
    );
  }

  const ownsStore = await SellerProfile.findOne({ userId: user._id }).lean();
  if (ownsStore) {
    throw new SettingsDomainError(
      "TEAM_MEMBER_IS_OWNER",
      "این کاربر فروشگاه مستقل خود را دارد",
      null,
    );
  }

  const exists = await TeamMember.findOne({ userId: user._id }).lean();
  if (exists) {
    throw new SettingsDomainError(
      "TEAM_MEMBER_ALREADY_EXISTS",
      "این کاربر قبلاً عضو تیم یک فروشگاه است",
      null,
    );
  }

  const member = await TeamMember.create({
    sellerProfileId: sellerId,
    userId: user._id,
    role: targetRole,
    note: typeof note === "string" ? note.slice(0, 300) : "",
  });

  // A roster member needs the platform "seller" role to pass the dashboard
  // requireRole("seller") guard; upgrade plain users on invite.
  const roleChanged = user.role !== "seller";
  if (roleChanged) {
    await User.updateOne({ _id: user._id }, { $set: { role: "seller" } });
  }

  return {
    member: teamMemberToDTO(member, user),
    roleChanged,
  };
}

async function changeTeamRole({ sellerId, memberId, role }) {
  if (!mongoose.Types.ObjectId.isValid(memberId)) {
    throw new SettingsDomainError("TEAM_MEMBER_NOT_FOUND", "عضو تیم یافت نشد", {
      field: "id",
    });
  }
  if (!TeamMember.TEAM_ROLES.includes(role)) {
    throw new SettingsDomainError("VALIDATION_ERROR", "نقش عضو تیم نامعتبر است", {
      field: "role",
    });
  }

  const member = await TeamMember.findOne({ _id: memberId, sellerProfileId: sellerId });
  if (!member) {
    throw new SettingsDomainError("TEAM_MEMBER_NOT_FOUND", "عضو تیم یافت نشد", {
      field: "id",
    });
  }

  const from = member.role;
  member.role = role;
  await member.save();

  const user = await User.findById(member.userId).select("name phone").lean();
  return {
    member: teamMemberToDTO(member, user),
    from,
  };
}

async function removeTeamMember({ sellerId, memberId }) {
  if (!mongoose.Types.ObjectId.isValid(memberId)) {
    throw new SettingsDomainError("TEAM_MEMBER_NOT_FOUND", "عضو تیم یافت نشد", {
      field: "id",
    });
  }

  const member = await TeamMember.findOne({ _id: memberId, sellerProfileId: sellerId });
  if (!member) {
    throw new SettingsDomainError("TEAM_MEMBER_NOT_FOUND", "عضو تیم یافت نشد", {
      field: "id",
    });
  }

  const removed = {
    id: String(member._id),
    userId: String(member.userId),
    role: member.role,
  };
  await TeamMember.deleteOne({ _id: member._id });
  return removed;
}

module.exports = {
  SettingsDomainError,
  SETTINGS_DEFAULTS,
  SETTINGS_KEYS,
  settingsDTO,
  getSettings,
  updateSettings,
  listTeam,
  inviteTeam,
  changeTeamRole,
  removeTeamMember,
};