import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { t } from "ttag";

import {
  EntityPickerModal,
  MiniPicker,
  type OmniPickerItem,
} from "metabase/common/components/Pickers";
import type { MiniPickerItem } from "metabase/common/components/Pickers/MiniPicker/types";
import { PLUGIN_LIBRARY } from "metabase/plugins";
import type { MenuProps } from "metabase/ui";

import type { SelectedMetric } from "../../../types/viewer-state";

export interface MetricSearchDropdownRef {
  onArrowDown: () => boolean;
  onArrowUp: () => boolean;
  containerRef: React.RefObject<HTMLDivElement>;
}

type MetricSearchDropdownProps = {
  anchorRect?: { left: number; top: number };
  onSelect: (metric: SelectedMetric) => void;
  onClose: () => void;
  externalSearchText?: string;
  selectedMetric?: SelectedMetric;
  menuProps?: MenuProps;
};

export const MetricSearchDropdown = forwardRef<
  MetricSearchDropdownRef,
  MetricSearchDropdownProps
>(function MetricSearchDropdown(
  {
    anchorRect,
    onSelect,
    onClose,
    externalSearchText,
    selectedMetric,
    menuProps,
  },
  ref,
) {
  const [isBrowsing, setIsBrowsing] = useState(false);

  const libraryMetricsCollection =
    PLUGIN_LIBRARY.useGetLibraryChildCollectionByType({
      type: "library-metrics",
    });

  const miniPickerRef = useRef<HTMLDivElement>(null);

  useImperativeHandle(ref, () => ({
    onArrowDown: () => {
      const firstElement =
        miniPickerRef.current?.querySelector('[role="menuitem"]');
      if (firstElement) {
        (firstElement as HTMLElement).focus();
      }
      return true;
    },
    onArrowUp: () => {
      const elements =
        miniPickerRef.current?.querySelectorAll('[role="menuitem"]') ?? [];
      const lastElement = elements[elements.length - 1];
      if (lastElement) {
        (lastElement as HTMLElement).focus();
      }
      return true;
    },
    containerRef: miniPickerRef,
  }));

  const handleSelectResult = useCallback(
    (item: OmniPickerItem) => {
      if (item.model !== "metric" && item.model !== "measure") {
        return;
      }
      if (typeof item.id !== "number") {
        return;
      }
      onSelect({
        id: item.id,
        name: item.name,
        sourceType: item.model,
      });
    },
    [onSelect],
  );

  const shouldHide = useCallback(
    (item: MiniPickerItem) => {
      if (selectedMetric) {
        return (
          item.id === selectedMetric.id &&
          item.model === selectedMetric.sourceType
        );
      }
      return false;
    },
    [selectedMetric],
  );

  return (
    <>
      <MiniPicker
        opened={!isBrowsing}
        searchQuery={externalSearchText}
        onChange={handleSelectResult}
        onClose={onClose}
        models={["metric", "measure"]}
        onBrowseAll={() => setIsBrowsing(true)}
        forceSearch={true}
        searchParams={{
          limit: 5,
        }}
        shouldHide={(item) => shouldHide(item as MiniPickerItem)}
        menuProps={menuProps}
        menuDropdownRef={miniPickerRef}
      >
        {anchorRect && (
          <span
            aria-hidden
            style={{
              position: "fixed",
              left: anchorRect.left,
              top: anchorRect.top,
              width: 0,
              height: 0,
              pointerEvents: "none",
            }}
          />
        )}
      </MiniPicker>
      {isBrowsing && (
        <EntityPickerModal
          title={t`Pick a metric or measure`}
          value={
            libraryMetricsCollection
              ? {
                  model: "collection",
                  id: libraryMetricsCollection.id as number,
                }
              : undefined
          }
          onChange={handleSelectResult}
          onClose={() => setIsBrowsing(false)}
          models={["metric", "measure", "table"]}
          isSelectableItem={(item) =>
            item.model === "metric" || item.model === "measure"
          }
          isDisabledItem={isTableWithoutMeasures}
          options={{
            hasConfirmButtons: false,
            hasDatabases: true,
            getItemTooltip: (item) => {
              if (isTableWithoutMeasures(item)) {
                return t`This table has no measures`;
              }
              return undefined;
            },
          }}
        />
      )}
    </>
  );
});

function isTableWithoutMeasures(item: OmniPickerItem) {
  return (
    item.model === "table" &&
    "measures" in item &&
    (item.measures?.length ?? 0) === 0
  );
}
