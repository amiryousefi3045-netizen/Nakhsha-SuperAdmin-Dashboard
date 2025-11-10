export interface Craft {
  id: string;
  title: string;
  description: string;
  category?: string;
  type?: string;
  dimensions?: string;
  craftingTime?: {
    total: number;
    unit: string;
  };
  images?: string[];
  materials?: {
    name: string;
    amount: number;
    unit: string;
  }[];
  craftingSteps?: {
    step: number;
    title?: string;
    description: string;
    image?: string;
  }[];
  tags?: string[];
  location?: {
    city: string;
    neighborhood?: string;
    coordinates: [number, number]; // [longitude, latitude]
  };
  artisan?: {
    id: string;
    name: string;
    avatar?: string;
  };
  createdAt: string;
  updatedAt: string;
  totalLikes: number;
  totalDislikes: number;
  liked: boolean;
  disliked: boolean;
  comments: Comment[];
}

export interface Comment {
  id: string;
  text: string;
  rating?: number;
  user: string;
  createdAt: string;
  updatedAt: string;
}

export interface LikeResponse {
  liked: boolean;
  totalLikes: number;
  totalDislikes: number;
}

export interface DislikeResponse {
  disliked: boolean;
  totalLikes: number;
  totalDislikes: number;
}
