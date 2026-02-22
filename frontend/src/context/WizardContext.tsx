/**
 * WizardContext – global state for the Create Listing wizard.
 * Persists form data across all steps without a third-party state library.
 */
import {
  createContext,
  useContext,
  useState,
  useCallback,
  type FC,
  type ReactNode,
} from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ListingType = "post" | "tour" | "training";

/** A single uploaded media item (image or video). */
export interface MediaItem {
  /** Stable client-side ID (crypto.randomUUID or Date.now string). */
  id: string;
  file: File;
  type: "image" | "video";
  /** Object-URL for preview; must be revoked on removal. */
  previewUrl: string;
}

export interface WizardMedia {
  items: MediaItem[];
  /** id of the chosen cover item; undefined = no cover set. */
  coverId?: string;
}

export interface WizardData {
  type: ListingType;

  // Step 0 – Basic Info
  title: string;
  description: string;

  // Step 1 – Media
  media: WizardMedia;

  // Step 2 – Pricing / Capacity
  price: string;
  currency: "تومان" | "دلار";
  forSale: boolean;
  capacity: string; // max attendees/units

  // Step 3 – Schedule  (primarily tour / training)
  startDate: string; // "YYYY-MM-DD"
  endDate: string;
  duration: string; // free text: "۳ ساعت"

  // Step 4 – Location
  province: string;
  city: string;
  address: string;
  /** GeoJSON Point coordinates [lng, lat] set by map picker */
  geo?: [number, number];

  // Step 5 – Tags / Category
  category: string;
  tags: string[]; // chosen from suggestions or typed
}

const EMPTY: WizardData = {
  type: "post",
  title: "",
  description: "",
  media: { items: [], coverId: undefined },
  price: "",
  currency: "تومان",
  forSale: true,
  capacity: "",
  startDate: "",
  endDate: "",
  duration: "",
  province: "",
  city: "",
  address: "",
  geo: undefined,
  category: "",
  tags: [],
};

// ─── Validation helper ────────────────────────────────────────────────────────

/** Returns an error message (string) if the step is invalid, or null if OK. */
export function validateStep(step: number, data: WizardData): string | null {
  switch (step) {
    case 0:
      if (data.title.trim().length < 5)
        return "عنوان باید حداقل ۵ کاراکتر باشد.";
      if (data.description.trim().length < 20)
        return "توضیحات باید حداقل ۲۰ کاراکتر باشد.";
      return null;
    case 1:
      // Media is optional; no hard requirement
      return null;
    case 2:
      if (data.forSale && (data.price === "" || Number(data.price) <= 0))
        return "لطفاً قیمت را وارد کنید.";
      if (
        (data.type === "tour" || data.type === "training") &&
        (data.capacity === "" || Number(data.capacity) <= 0)
      )
        return "ظرفیت را وارد کنید.";
      return null;
    case 3:
      if ((data.type === "tour" || data.type === "training") && !data.startDate)
        return "تاریخ شروع را انتخاب کنید.";
      if (
        data.startDate &&
        data.endDate &&
        new Date(data.startDate) > new Date(data.endDate)
      )
        return "تاریخ پایان باید بعد از تاریخ شروع باشد.";
      return null;
    case 4:
      if (!data.province) return "استان را انتخاب کنید.";
      if (!data.city.trim()) return "شهر را وارد کنید.";
      return null;
    case 5:
      if (!data.category && data.tags.length === 0)
        return "حداقل یک دسته‌بندی یا برچسب انتخاب کنید.";
      return null;
    case 6:
      // Review step – always passable
      return null;
    default:
      return null;
  }
}

// ─── Context ──────────────────────────────────────────────────────────────────

export const TOTAL_STEPS = 7;

interface WizardContextValue {
  data: WizardData;
  currentStep: number;
  totalSteps: number;
  /** Replace a subset of wizard data without touching other fields. */
  updateData: (patch: Partial<WizardData>) => void;
  /** Navigate forward (with optional caller-side validation bypass). */
  goNext: () => void;
  goBack: () => void;
  goToStep: (step: number) => void;
  resetWizard: (type?: ListingType) => void;
  /** Validation error for the current step (null = step is valid). */
  stepError: string | null;
  /** Try to advance; sets stepError if validation fails. Returns true on success. */
  tryGoNext: () => boolean;
}

const WizardContext = createContext<WizardContextValue | null>(null);

export function useWizard(): WizardContextValue {
  const ctx = useContext(WizardContext);
  if (!ctx) throw new Error("useWizard must be used inside <WizardProvider>");
  return ctx;
}

// ─── Provider ─────────────────────────────────────────────────────────────────

interface WizardProviderProps {
  children: ReactNode;
  initialType?: ListingType;
}

export const WizardProvider: FC<WizardProviderProps> = ({
  children,
  initialType = "post",
}) => {
  const [data, setData] = useState<WizardData>({ ...EMPTY, type: initialType });
  const [currentStep, setCurrentStep] = useState(0);
  const [stepError, setStepError] = useState<string | null>(null);

  const updateData = useCallback((patch: Partial<WizardData>) => {
    setData((prev) => ({ ...prev, ...patch }));
    setStepError(null);
  }, []);

  const goNext = useCallback(() => {
    setCurrentStep((prev) => Math.min(prev + 1, TOTAL_STEPS - 1));
    setStepError(null);
  }, []);

  const goBack = useCallback(() => {
    setCurrentStep((prev) => Math.max(prev - 1, 0));
    setStepError(null);
  }, []);

  const goToStep = useCallback((step: number) => {
    setCurrentStep(Math.max(0, Math.min(step, TOTAL_STEPS - 1)));
    setStepError(null);
  }, []);

  const resetWizard = useCallback((type?: ListingType) => {
    setData({ ...EMPTY, type: type ?? "post" });
    setCurrentStep(0);
    setStepError(null);
  }, []);

  const tryGoNext = useCallback((): boolean => {
    const error = validateStep(currentStep, data);
    if (error) {
      setStepError(error);
      return false;
    }
    setStepError(null);
    setCurrentStep((prev) => Math.min(prev + 1, TOTAL_STEPS - 1));
    return true;
  }, [currentStep, data]);

  return (
    <WizardContext.Provider
      value={{
        data,
        currentStep,
        totalSteps: TOTAL_STEPS,
        updateData,
        goNext,
        goBack,
        goToStep,
        resetWizard,
        stepError,
        tryGoNext,
      }}
    >
      {children}
    </WizardContext.Provider>
  );
};
