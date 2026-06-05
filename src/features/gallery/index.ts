/**
 * src/features/gallery/index.ts
 *
 * Public surface of the Gallery feature UI.
 * Mounted by src/app/(tabs)/gallery.tsx and src/app/gallery/[id].tsx.
 */

export { GalleryGrid } from './GalleryGrid';
export type { GalleryGridProps } from './GalleryGrid';

export { MultiSelectToolbar } from './MultiSelectToolbar';

export { GalleryEmptyState } from './GalleryEmptyState';
export type { GalleryEmptyStateProps } from './GalleryEmptyState';

export { ContactSheetButton } from './ContactSheetButton';

export { GalleryDetailView } from './GalleryDetailView';
export type { GalleryDetailViewProps } from './GalleryDetailView';

export { exportImage, exportImagesToPhotos } from './exportImage';
export type { ExportDestination, ExportResultStatus } from './exportImage';
