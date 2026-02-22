import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { createPost, uploadPostImages } from "../services/posts";
import type { CreatePostRequest } from "../types/api";
import LocationPickerModal, {
  type LocationPickerResult,
} from "../components/LocationPickerModal";

interface FormData {
  title: string;
  description: string;
  city: string;
  neighborhood: string;
  coordinates: { lat: number; lng: number } | null;
  addressText: string;
}

interface FormErrors {
  title?: string;
  description?: string;
  city?: string;
  neighborhood?: string;
  images?: string;
  addressText?: string;
  coordinates?: string;
}

const CreatePostPage = () => {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [formData, setFormData] = useState<FormData>({
    title: "",
    description: "",
    city: "",
    neighborhood: "",
    coordinates: null,
    addressText: "",
  });

  const [selectedImages, setSelectedImages] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitted, setSubmitted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLocationModalOpen, setIsLocationModalOpen] = useState(false);

  // Handle input changes
  const handleInputChange = (field: keyof FormData, value: string) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));

    // Clear field error when user starts typing
    if (submitted && errors[field]) {
      setErrors((prev) => ({
        ...prev,
        [field]: undefined,
      }));
    }
  };

  // Validate form
  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};

    if (!formData.title.trim()) {
      newErrors.title = "عنوان آگهی الزامی است";
    } else if (formData.title.length > 80) {
      newErrors.title = "عنوان نمی‌تواند بیش از 80 کاراکتر باشد";
    }

    if (!formData.description.trim()) {
      newErrors.description = "توضیحات الزامی است";
    } else if (formData.description.length > 2000) {
      newErrors.description = "توضیحات نمی‌تواند بیش از 2000 کاراکتر باشد";
    }

    if (!formData.city.trim()) {
      newErrors.city = "شهر الزامی است";
    }

    if (!formData.neighborhood.trim()) {
      newErrors.neighborhood = "محله الزامی است";
    }

    if (selectedImages.length === 0) {
      newErrors.images = "حداقل یک تصویر الزامی است";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Handle location picker modal
  const handleLocationPicker = () => {
    setIsLocationModalOpen(true);
  };

  const handleLocationConfirm = (result: LocationPickerResult) => {
    const lat = result.geo[1];
    const lng = result.geo[0];
    setFormData((prev) => ({
      ...prev,
      coordinates: { lat, lng },
      addressText: result.formattedAddress ?? result.address ?? "",
      city: prev.city || result.city || "",
      neighborhood: prev.neighborhood || "",
    }));
    setIsLocationModalOpen(false);
  };

  // Handle image selection
  const handleImageSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);

    if (files.length === 0) return;

    // Check file count
    if (selectedImages.length + files.length > 6) {
      setErrors((prev) => ({
        ...prev,
        images: "حداکثر 6 تصویر مجاز است",
      }));
      return;
    }

    // Validate file sizes
    for (const file of files) {
      if (file.size > 2 * 1024 * 1024) {
        // 2MB
        setErrors((prev) => ({
          ...prev,
          images: "حجم هر فایل نباید بیش از 2 مگابایت باشد",
        }));
        return;
      }
    }

    // Clear image errors
    if (errors.images) {
      setErrors((prev) => ({
        ...prev,
        images: undefined,
      }));
    }

    // Add new images
    const newImages = [...selectedImages, ...files];
    setSelectedImages(newImages);

    // Create previews
    const newPreviews = [...imagePreviews];
    files.forEach((file) => {
      newPreviews.push(URL.createObjectURL(file));
    });
    setImagePreviews(newPreviews);
  };

  // Remove image
  const handleImageRemove = (index: number) => {
    // Revoke object URL to free memory
    URL.revokeObjectURL(imagePreviews[index]);

    setSelectedImages((prev) => prev.filter((_, i) => i !== index));
    setImagePreviews((prev) => prev.filter((_, i) => i !== index));

    // Clear image error if any images remain
    if (selectedImages.length > 1 && errors.images) {
      setErrors((prev) => ({
        ...prev,
        images: undefined,
      }));
    }
  };

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    setErrorMessage(null);

    if (!validateForm()) {
      return;
    }

    setIsLoading(true);

    try {
      // Prepare post data
      const postData: CreatePostRequest = {
        title: formData.title.trim(),
        description: formData.description.trim(),
        location: {
          city: formData.city.trim(),
          neighborhood: formData.neighborhood.trim(),
          coordinates: formData.coordinates
            ? [formData.coordinates.lng, formData.coordinates.lat]
            : undefined,
        },
      };

      // Create the post
      const createdPost = await createPost(postData);

      // Upload images if any are selected
      if (selectedImages.length > 0) {
        await uploadPostImages(createdPost.id, selectedImages);
      }

      // Navigate to the created post
      navigate(`/p/${createdPost.id}`);
    } catch (error: any) {
      console.error("Error creating post:", error);

      // Handle validation errors
      if (
        error.code === "VALIDATION_ERROR" &&
        error.details &&
        error.details.field
      ) {
        const newErrors: FormErrors = {};

        // Map backend field errors to form field errors
        if (error.details.field === "title") {
          newErrors.title = error.message;
        } else if (error.details.field === "description") {
          newErrors.description = error.message;
        } else if (error.details.field === "location.city") {
          newErrors.city = error.message;
        } else if (error.details.field === "location.neighborhood") {
          newErrors.neighborhood = error.message;
        } else if (error.details.field === "images") {
          newErrors.images = error.message;
        } else {
          // Fallback for unknown fields
          setErrorMessage(error.message || "خطا در اطلاعات وارد شده");
        }

        if (Object.keys(newErrors).length > 0) {
          setErrors(newErrors);
        }
      } else {
        // Handle other errors (network, server, etc.) or validation without specific field
        setErrorMessage(
          error.message || "خطا در ارسال آگهی. لطفاً دوباره تلاش کنید.",
        );
      }

      // Scroll to top so user sees the error immediately
      window.scrollTo({ top: 0, behavior: "smooth" });
    } finally {
      setIsLoading(false);
    }
  };

  // Check if form is valid
  const isFormValid = () => {
    return (
      !isLoading &&
      formData.title.trim() &&
      formData.title.length <= 80 &&
      formData.description.trim() &&
      formData.description.length <= 2000 &&
      formData.city.trim() &&
      formData.neighborhood.trim() &&
      selectedImages.length > 0 &&
      selectedImages.length <= 6
    );
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8" dir="rtl">
      <div className="max-w-2xl mx-auto px-4">
        <div className="bg-white rounded-lg shadow-sm p-6">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-gray-900 mb-2">
              ثبت آگهی جدید
            </h1>
            <p className="text-gray-600">
              اطلاعات محصول یا خدمت خود را کامل کنید
            </p>
          </div>

          {/* Error Message */}
          {errorMessage && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-md">
              <p className="text-red-600 text-sm">{errorMessage}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Title Field */}
            <div>
              <label
                htmlFor="title"
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                عنوان آگهی *
              </label>
              <div className="relative">
                <input
                  id="title"
                  type="text"
                  value={formData.title}
                  onChange={(e) => handleInputChange("title", e.target.value)}
                  className={`w-full px-3 py-2 border rounded-md text-right ${
                    submitted && errors.title
                      ? "border-red-300 focus:ring-red-500 focus:border-red-500"
                      : "border-gray-300 focus:ring-blue-500 focus:border-blue-500"
                  } focus:outline-none focus:ring-1`}
                  placeholder="عنوان جذاب برای آگهی‌تان انتخاب کنید"
                  maxLength={80}
                />
                <div className="absolute left-3 bottom-2 text-xs text-gray-400">
                  {formData.title.length}/80
                </div>
              </div>
              {submitted && errors.title && (
                <p className="mt-1 text-sm text-red-600">{errors.title}</p>
              )}
            </div>

            {/* Description Field */}
            <div>
              <label
                htmlFor="description"
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                توضیحات *
              </label>
              <div className="relative">
                <textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) =>
                    handleInputChange("description", e.target.value)
                  }
                  rows={6}
                  className={`w-full px-3 py-2 border rounded-md text-right resize-none ${
                    submitted && errors.description
                      ? "border-red-300 focus:ring-red-500 focus:border-red-500"
                      : "border-gray-300 focus:ring-blue-500 focus:border-blue-500"
                  } focus:outline-none focus:ring-1`}
                  placeholder="جزئیات کامل محصول یا خدمت خود را شرح دهید..."
                  maxLength={2000}
                />
                <div className="absolute left-3 bottom-2 text-xs text-gray-400">
                  {formData.description.length}/2000
                </div>
              </div>
              {submitted && errors.description && (
                <p className="mt-1 text-sm text-red-600">
                  {errors.description}
                </p>
              )}
            </div>

            {/* Location Fields */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* City Field */}
              <div>
                <label
                  htmlFor="city"
                  className="block text-sm font-medium text-gray-700 mb-2"
                >
                  شهر *
                </label>
                <input
                  id="city"
                  type="text"
                  value={formData.city}
                  onChange={(e) => handleInputChange("city", e.target.value)}
                  className={`w-full px-3 py-2 border rounded-md text-right ${
                    submitted && errors.city
                      ? "border-red-300 focus:ring-red-500 focus:border-red-500"
                      : "border-gray-300 focus:ring-blue-500 focus:border-blue-500"
                  } focus:outline-none focus:ring-1`}
                  placeholder="تهران"
                />
                {submitted && errors.city && (
                  <p className="mt-1 text-sm text-red-600">{errors.city}</p>
                )}
              </div>

              {/* Neighborhood Field */}
              <div>
                <label
                  htmlFor="neighborhood"
                  className="block text-sm font-medium text-gray-700 mb-2"
                >
                  محله *
                </label>
                <input
                  id="neighborhood"
                  type="text"
                  value={formData.neighborhood}
                  onChange={(e) =>
                    handleInputChange("neighborhood", e.target.value)
                  }
                  className={`w-full px-3 py-2 border rounded-md text-right ${
                    submitted && errors.neighborhood
                      ? "border-red-300 focus:ring-red-500 focus:border-red-500"
                      : "border-gray-300 focus:ring-blue-500 focus:border-blue-500"
                  } focus:outline-none focus:ring-1`}
                  placeholder="یوسف آباد"
                />
                {submitted && errors.neighborhood && (
                  <p className="mt-1 text-sm text-red-600">
                    {errors.neighborhood}
                  </p>
                )}
              </div>
            </div>

            {/* Map Location Picker */}
            <div className="flex items-center gap-4 pt-2">
              <button
                type="button"
                onClick={handleLocationPicker}
                className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-blue-600 bg-blue-50 border border-blue-200 rounded-md hover:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                🗺️ انتخاب از نقشه
              </button>

              {formData.coordinates && (
                <div className="flex-1 text-sm text-gray-600">
                  <div className="font-medium">موقعیت انتخاب شده:</div>
                  <div className="text-xs mt-1">
                    {formData.addressText ? (
                      <span>{formData.addressText}</span>
                    ) : (
                      <span>
                        عرض جغرافیایی: {formData.coordinates.lat.toFixed(6)},
                        طول جغرافیایی: {formData.coordinates.lng.toFixed(6)}
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Image Upload */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                تصاویر * (حداکثر 6 تصویر، هر کدام حداکثر 2 مگابایت)
              </label>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={handleImageSelect}
                className="hidden"
              />

              <div className="space-y-4">
                {/* Add Images Button */}
                {selectedImages.length < 6 && (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full border-2 border-dashed border-gray-300 rounded-md px-4 py-6 text-center hover:border-blue-400 transition-colors"
                  >
                    <div className="flex flex-col items-center">
                      <svg
                        className="w-8 h-8 text-gray-400 mb-2"
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
                      <span className="text-gray-600 font-medium">
                        افزودن عکس
                      </span>
                      <span className="text-sm text-gray-400 mt-1">
                        {selectedImages.length}/6 تصویر انتخاب شده
                      </span>
                    </div>
                  </button>
                )}

                {/* Image Previews */}
                {imagePreviews.length > 0 && (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    {imagePreviews.map((preview, index) => (
                      <div key={index} className="relative group">
                        <img
                          src={preview}
                          alt={`پیش‌نمایش ${index + 1}`}
                          className="w-full h-32 object-cover rounded-md border border-gray-200"
                        />
                        <button
                          type="button"
                          onClick={() => handleImageRemove(index)}
                          className="absolute top-1 left-1 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs hover:bg-red-600 transition-colors"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {submitted && errors.images && (
                <p className="mt-1 text-sm text-red-600">{errors.images}</p>
              )}
            </div>

            {/* Submit Button */}
            <div className="flex gap-4">
              <button
                type="submit"
                disabled={!isFormValid() || isLoading}
                className={`flex-1 px-6 py-3 rounded-md font-medium transition-colors flex items-center justify-center gap-2 ${
                  isFormValid() && !isLoading
                    ? "bg-blue-600 text-white hover:bg-blue-700"
                    : "bg-gray-300 text-gray-500 cursor-not-allowed"
                }`}
              >
                {isLoading && (
                  <svg
                    className="animate-spin h-5 w-5 text-white"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    ></circle>
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    ></path>
                  </svg>
                )}
                {isLoading ? "در حال ثبت..." : "ثبت آگهی"}
              </button>

              <button
                type="button"
                onClick={() => navigate(-1)}
                className="px-6 py-3 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 transition-colors"
              >
                انصراف
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Location Picker Modal */}
      <LocationPickerModal
        open={isLocationModalOpen}
        onClose={() => setIsLocationModalOpen(false)}
        initialGeo={
          formData.coordinates
            ? [formData.coordinates.lng, formData.coordinates.lat]
            : undefined
        }
        onConfirm={handleLocationConfirm}
      />
    </div>
  );
};

export default CreatePostPage;
