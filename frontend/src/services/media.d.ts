export function uploadImage(file: File | Blob | any): Promise<{ url: string }>;
export function reverseGeocode(lat: number, lng: number): Promise<any>;

// Minimal types for the local media helper (JS). These are intentionally loose
// to keep migration incremental while silencing compiler complaints.
