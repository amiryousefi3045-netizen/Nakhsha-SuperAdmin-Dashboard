import React, { useState, useEffect } from "react";
import { useAuth } from "../hooks/useAuth";
import AuthModal from "../components/auth/AuthModal";

interface FormData {
  name: string;
  bio: string;
  city: string;
  neighborhood: string;
}

interface FormErrors {
  name?: string;
  bio?: string;
}

const ProfilePage: React.FC = () => {
  const { user, isLoading, isAuthed, updateUser, refreshMe } = useAuth();
  const [isEditing, setIsEditing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [hasTriedSubmit, setHasTriedSubmit] = useState(false);
  const [avatarError, setAvatarError] = useState(false);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);

  const [formData, setFormData] = useState<FormData>({
    name: "",
    bio: "",
    city: "",
    neighborhood: "",
  });

  const [errors, setErrors] = useState<FormErrors>({});

  // Initialize form data when user data is available
  useEffect(() => {
    if (user) {
      setFormData({
        name: user.name || "",
        bio: user.bio || "",
        city: user.location?.city || "",
        neighborhood: user.location?.neighborhood || "",
      });
      setAvatarError(false); // Reset avatar error when user changes
    }
  }, [user]);

  // Show auth modal if user is not authenticated
  useEffect(() => {
    if (!isLoading && !isAuthed && !showAuthModal) {
      setShowAuthModal(true);
    }
  }, [isLoading, isAuthed, showAuthModal]);

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};

    if (!formData.name.trim()) {
      newErrors.name = "نام الزامی است";
    } else if (formData.name.length > 60) {
      newErrors.name = "نام نباید بیش از ۶۰ کاراکتر باشد";
    }

    if (formData.bio.length > 300) {
      newErrors.bio = "بیوگرافی نباید بیش از ۳۰۰ کاراکتر باشد";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleInputChange = (field: keyof FormData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));

    // Clear error for this field if user is typing and has tried to submit
    if (hasTriedSubmit && errors[field as keyof FormErrors]) {
      setErrors((prev) => ({ ...prev, [field]: undefined }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setHasTriedSubmit(true);
    setErrorMessage("");

    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);

    try {
      await updateUser({
        name: formData.name.trim(),
        bio: formData.bio.trim(),
        city: formData.city.trim(),
        neighborhood: formData.neighborhood.trim(),
      });
      setIsEditing(false);
      setHasTriedSubmit(false);
      // Clear any previous error message on success
      setErrorMessage("");
    } catch (error: any) {
      // Handle normalized error format from auth service
      const errorMsg = error.message || "خطایی در به‌روزرسانی پروفایل رخ داد";
      setErrorMessage(errorMsg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!allowedTypes.includes(file.type)) {
      setErrorMessage("فقط فایل‌های JPEG، PNG و WebP پشتیبانی می‌شوند");
      return;
    }

    // Validate file size (2MB)
    if (file.size > 2 * 1024 * 1024) {
      setErrorMessage("حداکثر اندازه فایل ۲ مگابایت است");
      return;
    }

    setAvatarFile(file);

    // Create preview
    const reader = new FileReader();
    reader.onload = (e) => {
      setAvatarPreview(e.target?.result as string);
    };
    reader.readAsDataURL(file);
    setErrorMessage("");
  };

  const uploadAvatar = async () => {
    if (!avatarFile) return;

    setIsUploadingAvatar(true);
    try {
      const formData = new FormData();
      formData.append("avatar", avatarFile);

      const token = localStorage.getItem("nakhsha_token");
      const response = await fetch("/api/users/me/avatar", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || "خطا در آپلود عکس");
      }

      // Refresh user data to get the new avatar
      await refreshMe();

      // Clear avatar preview and file
      setAvatarFile(null);
      setAvatarPreview(null);

      setErrorMessage("");
    } catch (error: any) {
      setErrorMessage(error.message || "خطا در آپلود عکس پروفایل");
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  const handleCancelEdit = () => {
    if (user) {
      setFormData({
        name: user.name || "",
        bio: user.bio || "",
        city: user.location?.city || "",
        neighborhood: user.location?.neighborhood || "",
      });
    }
    setIsEditing(false);
    setErrors({});
    setErrorMessage("");
    setHasTriedSubmit(false);
    // Clear avatar preview and file
    setAvatarFile(null);
    setAvatarPreview(null);
  };

  const handleAvatarError = (e: React.SyntheticEvent<HTMLImageElement>) => {
    if (!avatarError) {
      setAvatarError(true);
      // Use a simple SVG data URL as fallback to avoid 404 loops
      e.currentTarget.src =
        "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjQiIGhlaWdodD0iNjQiIHZpZXdCb3g9IjAgMCA2NCA2NCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGNpcmNsZSBjeD0iMzIiIGN5PSIzMiIgcj0iMzIiIGZpbGw9IiNGM0Y0RjYiLz4KPHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeD0iMjAiIHk9IjIwIj4KPHBhdGggZD0iTTEyIDEyQzE0LjIxIDEyIDE2IDEwLjIxIDE2IDhDMTYgNS43OSAxNC4yMSA0IDEyIDRDOS43OSA0IDggNS43OSA4IDhDOCAxMC4yMSA5Ljc5IDEyIDEyIDEyWk0xMiAxNEM5LjMzIDE0IDQgMTUuMzQgNCAyMFYyMkgyMFYyMEMyMCAxNS4zNCAxNC42NyAxNCAxMiAxNFoiIGZpbGw9IiM5Q0E0QUYiLz4KPC9zdmc+Cjwvc3ZnPg==";
    }
  };

  // Show loading while checking authentication
  if (isLoading) {
    return (
      <div className="min-h-[400px] flex items-center justify-center">
        <div className="text-gray-600">در حال بارگذاری...</div>
      </div>
    );
  }

  // Show auth modal if not authenticated
  if (!isAuthed) {
    return (
      <>
        <div className="min-h-[400px] flex flex-col items-center justify-center px-4 text-center">
          <h2 className="text-xl font-semibold text-gray-800 mb-4">
            برای مشاهده پروفایل وارد شوید
          </h2>
          <p className="text-gray-600 mb-6">
            برای دسترسی به پروفایل خود ابتدا وارد حساب کاربری‌تان شوید
          </p>
          <button
            onClick={() => setShowAuthModal(true)}
            className="bg-green-600 text-white px-6 py-2 rounded-lg hover:bg-green-700 transition-colors"
          >
            ورود به حساب کاربری
          </button>
        </div>
        <AuthModal
          isOpen={showAuthModal}
          onClose={() => setShowAuthModal(false)}
          onSuccess={async () => {
            setShowAuthModal(false);
            await refreshMe();
          }}
        />
      </>
    );
  }

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case "admin":
        return "bg-purple-100 text-purple-800";
      case "tour_leader":
        return "bg-blue-100 text-blue-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const getCreatorTypeBadgeColor = (creatorType: string) => {
    switch (creatorType) {
      case "artisan":
        return "bg-orange-100 text-orange-800";
      case "tour_leader":
        return "bg-green-100 text-green-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const getRoleLabel = (role: string) => {
    switch (role) {
      case "admin":
        return "مدیر";
      case "tour_leader":
        return "راهنمای تور";
      default:
        return "کاربر";
    }
  };

  const getCreatorTypeLabel = (creatorType: string) => {
    switch (creatorType) {
      case "artisan":
        return "صنعتگر";
      case "tour_leader":
        return "راهنمای تور";
      default:
        return "";
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        {/* Header */}
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-gray-900">پروفایل من</h1>
            {!isEditing && (
              <button
                onClick={() => setIsEditing(true)}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700 transition-colors"
              >
                ویرایش پروفایل
              </button>
            )}
          </div>
        </div>

        {/* Profile Content */}
        <div className="p-6">
          {!isEditing ? (
            // View Mode
            <div className="space-y-6">
              {user && (
                <>
                  {/* Avatar and Basic Info */}
                  <div className="flex items-center gap-4">
                    <img
                      src={user.avatar}
                      alt={user.name}
                      className="w-16 h-16 rounded-full object-cover"
                      onError={handleAvatarError}
                    />
                    <div className="flex-1">
                      <h2 className="text-xl font-semibold text-gray-900">
                        {user.name}
                      </h2>
                      <p className="text-gray-600 text-sm" dir="ltr">
                        {user.phone}
                      </p>
                    </div>
                  </div>

                  {/* Badges */}
                  <div className="flex gap-2 flex-wrap">
                    <span
                      className={`px-3 py-1 rounded-full text-sm font-medium ${getRoleBadgeColor(
                        user.role
                      )}`}
                    >
                      {getRoleLabel(user.role)}
                    </span>
                    {user.creatorType && (
                      <span
                        className={`px-3 py-1 rounded-full text-sm font-medium ${getCreatorTypeBadgeColor(
                          user.creatorType
                        )}`}
                      >
                        {getCreatorTypeLabel(user.creatorType)}
                      </span>
                    )}
                    {user.isVerified && (
                      <span className="px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-800">
                        تأیید شده
                      </span>
                    )}
                  </div>

                  {/* Bio */}
                  <div>
                    <h3 className="font-medium text-gray-900 mb-2">
                      درباره من
                    </h3>
                    <p className="text-gray-700 leading-relaxed">
                      {user.bio || "هنوز بیوگرافی‌ای نوشته نشده است."}
                    </p>
                  </div>

                  {/* Location */}
                  <div>
                    <h3 className="font-medium text-gray-900 mb-2">موقعیت</h3>
                    <p className="text-gray-700">
                      {[user.location?.city, user.location?.neighborhood]
                        .filter(Boolean)
                        .join("، ") || "موقعیت مشخص نشده است."}
                    </p>
                  </div>
                </>
              )}
            </div>
          ) : (
            // Edit Mode
            <form onSubmit={handleSubmit} className="space-y-6">
              {errorMessage && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
                  {errorMessage}
                </div>
              )}

              {/* Avatar and Basic Info */}
              <div className="flex items-center gap-4">
                <div className="relative">
                  <img
                    src={avatarPreview || user?.avatar}
                    alt={user?.name || ""}
                    className="w-16 h-16 rounded-full object-cover"
                    onError={handleAvatarError}
                  />
                  <input
                    type="file"
                    id="avatar-upload"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={handleAvatarChange}
                    className="hidden"
                  />
                  <label
                    htmlFor="avatar-upload"
                    className="absolute -bottom-1 -right-1 bg-blue-600 text-white rounded-full p-1 cursor-pointer hover:bg-blue-700 transition-colors text-xs"
                    title="تغییر عکس پروفایل"
                  >
                    <svg
                      className="w-3 h-3"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 6v6m0 0v6m0-6h6m-6 0H6"
                      />
                    </svg>
                  </label>
                </div>
                <div className="flex-1">
                  <p className="text-gray-600 text-sm" dir="ltr">
                    {user?.phone}
                  </p>
                  {avatarFile && (
                    <div className="mt-2 flex gap-2">
                      <button
                        type="button"
                        onClick={uploadAvatar}
                        disabled={isUploadingAvatar}
                        className="bg-green-600 text-white px-3 py-1 rounded text-xs hover:bg-green-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
                      >
                        {isUploadingAvatar ? "در حال آپلود..." : "ذخیره عکس"}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setAvatarFile(null);
                          setAvatarPreview(null);
                          // Reset file input
                          const input = document.getElementById(
                            "avatar-upload"
                          ) as HTMLInputElement;
                          if (input) input.value = "";
                        }}
                        className="bg-gray-500 text-white px-3 py-1 rounded text-xs hover:bg-gray-600 transition-colors"
                      >
                        انصراف
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Name Field */}
              <div>
                <label
                  htmlFor="name"
                  className="block text-sm font-medium text-gray-700 mb-2"
                >
                  نام *
                </label>
                <input
                  type="text"
                  id="name"
                  value={formData.name}
                  onChange={(e) => handleInputChange("name", e.target.value)}
                  className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    hasTriedSubmit && errors.name
                      ? "border-red-300 focus:ring-red-500"
                      : "border-gray-300"
                  }`}
                  maxLength={60}
                  placeholder="نام خود را وارد کنید"
                />
                {hasTriedSubmit && errors.name && (
                  <p className="text-red-500 text-sm mt-1">{errors.name}</p>
                )}
                <p className="text-gray-500 text-xs mt-1">
                  {formData.name.length}/60 کاراکتر
                </p>
              </div>

              {/* Bio Field */}
              <div>
                <label
                  htmlFor="bio"
                  className="block text-sm font-medium text-gray-700 mb-2"
                >
                  درباره من
                </label>
                <textarea
                  id="bio"
                  value={formData.bio}
                  onChange={(e) => handleInputChange("bio", e.target.value)}
                  className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none ${
                    hasTriedSubmit && errors.bio
                      ? "border-red-300 focus:ring-red-500"
                      : "border-gray-300"
                  }`}
                  rows={4}
                  maxLength={300}
                  placeholder="چند خط درباره خودتان بنویسید..."
                />
                {hasTriedSubmit && errors.bio && (
                  <p className="text-red-500 text-sm mt-1">{errors.bio}</p>
                )}
                <p className="text-gray-500 text-xs mt-1">
                  {formData.bio.length}/300 کاراکتر
                </p>
              </div>

              {/* Location Fields */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="city"
                    className="block text-sm font-medium text-gray-700 mb-2"
                  >
                    شهر
                  </label>
                  <input
                    type="text"
                    id="city"
                    value={formData.city}
                    onChange={(e) => handleInputChange("city", e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="شهر خود را وارد کنید"
                  />
                </div>
                <div>
                  <label
                    htmlFor="neighborhood"
                    className="block text-sm font-medium text-gray-700 mb-2"
                  >
                    محله
                  </label>
                  <input
                    type="text"
                    id="neighborhood"
                    value={formData.neighborhood}
                    onChange={(e) =>
                      handleInputChange("neighborhood", e.target.value)
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="محله خود را وارد کنید"
                  />
                </div>
              </div>

              {/* Form Actions */}
              <div className="flex gap-3 pt-4">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="bg-green-600 text-white px-6 py-2 rounded-lg hover:bg-green-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed flex-1 md:flex-none"
                >
                  {isSubmitting ? "در حال ذخیره..." : "ذخیره تغییرات"}
                </button>
                <button
                  type="button"
                  onClick={handleCancelEdit}
                  disabled={isSubmitting}
                  className="bg-gray-500 text-white px-6 py-2 rounded-lg hover:bg-gray-600 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed flex-1 md:flex-none"
                >
                  لغو
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

export default ProfilePage;
