import React, { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import {
  getProfileById,
  getPublicProfile,
  isProfileSaved,
  saveProfile,
  unsaveProfile,
} from "../services/profile";
import ProfileBanner from "../components/ProfileBanner";
import ProfileHeader from "../components/ProfileHeader";
import ProfileTabs from "../components/ProfileTabs";
import ProfileTabContent from "../components/ProfileTabContent";

const PublicProfile = () => {
  const { handle, id } = useParams();
  const navigate = useNavigate();
  const { user: currentUser } = useAuth();
  const [searchParams] = useSearchParams();

  const [profileUser, setProfileUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isSaved, setIsSaved] = useState(false);

  // Get active tab from URL params
  const activeTab = searchParams.get("tab") || "posts";

  // Determine if this is the current user's own profile
  const isOwnProfile =
    currentUser && profileUser && currentUser.id === profileUser.id;

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  useEffect(() => {
    if (currentUser && profileUser && !isOwnProfile) {
      checkIfSaved();
    }
  }, [currentUser, profileUser, isOwnProfile, checkIfSaved]);

  const loadProfile = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      let profileData;

      if (handle) {
        // Use the new getPublicProfile API for handle-based lookups
        profileData = await getPublicProfile(handle);
      } else if (id) {
        // Fallback to ID-based lookup (legacy support)
        profileData = await getProfileById(id);
      } else {
        throw new Error("مشخصات کاربر نامعتبر است");
      }

      setProfileUser(profileData);
    } catch (err) {
      console.error("Failed to load profile:", err);

      // Handle different error types
      if (err.response?.status === 404) {
        setError("کاربری با این مشخصات یافت نشد");
      } else {
        setError(err?.message || "خطا در بارگذاری پروفایل");
      }
    } finally {
      setIsLoading(false);
    }
  }, [handle, id]);

  const checkIfSaved = useCallback(async () => {
    if (!profileUser || !currentUser) return;

    try {
      const saved = await isProfileSaved(profileUser.id);
      setIsSaved(saved);
    } catch (err) {
      console.error("Failed to check saved status:", err);
      // Fail silently for this feature
      setIsSaved(false);
    }
  }, [profileUser, currentUser]);

  const handleSaveToggle = async (shouldSave) => {
    if (!profileUser || !currentUser) return;

    try {
      if (shouldSave) {
        await saveProfile(profileUser.id);
      } else {
        await unsaveProfile(profileUser.id);
      }
      setIsSaved(shouldSave);
    } catch (err) {
      console.error("Failed to toggle save status:", err);
      // Could show a toast notification here
    }
  };

  const handleContact = () => {
    if (!profileUser) return;

    // For now, this could open a modal or navigate to a contact page
    // You could implement direct messaging, email, or phone contact
    console.log("Contact user:", profileUser.id);
    // Example: navigate(`/contact/${profileUser.id}`);
  };

  const handleEditProfile = () => {
    // Navigate to profile edit page
    navigate("/profile");
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-nakhsha-bg">
        <div className="h-48 md:h-64 lg:h-80 bg-gray-200 animate-pulse" />
        <div className="px-4 md:px-6 lg:px-8">
          <div className="max-w-6xl mx-auto">
            <div className="relative -mt-16 md:-mt-20 lg:-mt-24 mb-4">
              <div className="w-24 h-24 md:w-32 md:h-32 lg:w-40 lg:h-40 rounded-full border-4 border-white bg-gray-200 animate-pulse" />
            </div>
            <div className="space-y-4">
              <div className="h-8 bg-gray-200 rounded animate-pulse w-64" />
              <div className="h-4 bg-gray-200 rounded animate-pulse w-96" />
              <div className="h-4 bg-gray-200 rounded animate-pulse w-48" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-nakhsha-bg flex items-center justify-center">
        <div className="text-center p-8">
          <div className="text-red-500 text-6xl mb-4">⚠️</div>
          <h1 className="text-2xl font-bold text-nakhsha-text mb-2">
            خطا در بارگذاری پروفایل
          </h1>
          <p className="text-gray-600 mb-6">{error}</p>
          <button
            onClick={() => navigate("/")}
            className="px-6 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors"
          >
            بازگشت به صفحه اصلی
          </button>
        </div>
      </div>
    );
  }

  if (!profileUser) {
    return (
      <div className="min-h-screen bg-nakhsha-bg flex items-center justify-center">
        <div className="text-center p-8">
          <div className="text-gray-400 text-6xl mb-4">👤</div>
          <h1 className="text-2xl font-bold text-nakhsha-text mb-2">
            پروفایل یافت نشد
          </h1>
          <p className="text-gray-600 mb-6">
            کاربری با این شناسه وجود ندارد یا حذف شده است
          </p>
          <button
            onClick={() => navigate("/")}
            className="px-6 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors"
          >
            بازگشت به صفحه اصلی
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-nakhsha-bg" dir="rtl">
      {/* Profile Banner */}
      <ProfileBanner />

      {/* Profile Header with Avatar, Name, Bio, Actions */}
      <div className="pb-8">
        <ProfileHeader
          user={profileUser}
          isOwnProfile={!!isOwnProfile}
          isSaved={isSaved}
          onSaveToggle={handleSaveToggle}
          onContact={handleContact}
          onEditProfile={handleEditProfile}
        />
      </div>

      {/* Profile Tabs */}
      <ProfileTabs />

      {/* Profile Content Section */}
      <div className="bg-nakhsha-bg min-h-[400px]">
        <div className="px-4 md:px-6 lg:px-8 py-6">
          <div className="max-w-6xl mx-auto">
            <ProfileTabContent
              activeTab={activeTab}
              user={{
                id: profileUser.id,
                name: profileUser.name,
                creatorType: profileUser.creatorType,
                location: profileUser.location,
              }}
              isOwnProfile={!!isOwnProfile}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default PublicProfile;
