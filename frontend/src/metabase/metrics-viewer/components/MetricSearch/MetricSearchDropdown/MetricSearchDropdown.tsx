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

import type { SelectedMetric } from "../../../types/viewer-state";

export interface MetricSearchDropdownRef {
  onArrowDown: () => boolean;
  onArrowUp: () => boolean;
  containerRef: React.RefObject<HTMLDivElement>;
}

type MetricSearchDropdownProps = {
  onSelect: (metric: SelectedMetric) => void;
  onClose: () => void;
  externalSearchText?: string;
};

export const MetricSearchDropdown = forwardRef<
  MetricSearchDropdownRef,
  MetricSearchDropdownProps
>(function MetricSearchDropdown(
  { onSelect, onClose, externalSearchText },
  ref,
) {
  const [isBrowsing, setIsBrowsing] = useState(false);

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
        menuDropdownRef={miniPickerRef}
      />
      {isBrowsing && (
        <EntityPickerModal
          title={t`Pick a metric or measure`}
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
