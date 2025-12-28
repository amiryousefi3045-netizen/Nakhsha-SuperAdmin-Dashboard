import React, { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import ContentDetailLayout from "../components/ContentDetailLayout";
import { getContentById, ContentItem } from "../utils/contentApi";

const TourDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [content, setContent] = useState<ContentItem | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSaved, setIsSaved] = useState(false);

  useEffect(() => {
    const fetchContent = async () => {
      if (!id) {
        setError("شناسه محتوا ارائه نشده است");
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        setError(null);

        const data = await getContentById("tour", id);

        if (!data) {
          setError("تور یافت نشد");
          setContent(null);
        } else {
          setContent(data);
        }
      } catch (err) {
        console.error("Error fetching tour:", err);
        setError("خطا در دریافت تور");
        setContent(null);
      } finally {
        setIsLoading(false);
      }
    };

    fetchContent();
  }, [id]);

  const handleContact = () => {
    alert("قابلیت تماس به زودی اضافه خواهد شد");
  };

  const handleSave = () => {
    setIsSaved(!isSaved);
  };

  const handleBookTour = () => {
    alert("قابلیت رزرو تور به زودی اضافه خواهد شد");
  };

  return (
    <ContentDetailLayout
      content={content}
      isLoading={isLoading}
      error={error}
      onContact={handleContact}
      onSave={handleSave}
      onBookTour={handleBookTour}
      isSaved={isSaved}
    />
  );
};

export default TourDetailPage;
