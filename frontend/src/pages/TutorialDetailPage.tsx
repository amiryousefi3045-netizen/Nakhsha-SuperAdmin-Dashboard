import React, { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import ContentDetailLayout from "../components/ContentDetailLayout";
import { getContentById, ContentItem } from "../utils/contentApi";

const TutorialDetailPage: React.FC = () => {
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

        const data = await getContentById("tutorial", id);

        if (!data) {
          setError("آموزش یافت نشد");
          setContent(null);
        } else {
          setContent(data);
        }
      } catch (err) {
        console.error("Error fetching tutorial:", err);
        setError("خطا در دریافت آموزش");
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

  return (
    <ContentDetailLayout
      content={content}
      isLoading={isLoading}
      error={error}
      onContact={handleContact}
      onSave={handleSave}
      isSaved={isSaved}
    />
  );
};

export default TutorialDetailPage;
