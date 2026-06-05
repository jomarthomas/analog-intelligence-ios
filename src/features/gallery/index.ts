/**
 * src/features/gallery/index.ts
 *
 * Public surface of the Gallery feature UI.
 * Mounted by src/app/(tabs)/gallery.tsx and src/app/gallery/[id].tsx.
 */

export { GalleryGrid } from './GalleryGrid';
export type { GalleryGridProps } from './GalleryGrid';

export { GalleryRollSectionList } from './GalleryRollSectionList';
export type { GalleryRollSectionListProps } from './GalleryRollSectionList';

export { RollSectionHeader } from './RollSectionHeader';
export type { RollSectionHeaderProps } from './RollSectionHeader';

export { GallerySortControl, getInitialSortOrder } from './GallerySortControl';
export type { GallerySortControlProps } from './GallerySortControl';

export { RollMetadataSheet } from './RollMetadataSheet';
export type { RollMetadataSheetProps } from './RollMetadataSheet';

export { FrameMetadataPanel } from './FrameMetadataPanel';
export type { FrameMetadataPanelProps } from './FrameMetadataPanel';

export { MultiSelectToolbar } from './MultiSelectToolbar';

export { GalleryEmptyState } from './GalleryEmptyState';
export type { GalleryEmptyStateProps } from './GalleryEmptyState';

export { ContactSheetButton } from './ContactSheetButton';

export { GalleryDetailView } from './GalleryDetailView';
export type { GalleryDetailViewProps } from './GalleryDetailView';

export { exportImage, exportImagesToPhotos } from './exportImage';
export type { ExportDestination, ExportResultStatus } from './exportImage';

export {
  buildFrameSidecar,
  buildRollSidecar,
  buildFrameSidecarDocument,
  buildRollSidecarDocument,
  buildRollCsv,
  exportFrameSidecar,
  exportRollSidecarJson,
  exportRollSidecarCsv,
} from './metadataSidecar';
export type { SidecarResult } from './metadataSidecar';

export {
  groupImagesByRoll,
  describeRoll,
  formatRollDate,
} from './galleryGrouping';
export type { RollSection } from './galleryGrouping';
