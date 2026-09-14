import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, X } from "lucide-react";
import type { FC } from "react";
import { Item, ItemActions, ItemContent, ItemTitle } from "@/components/ui/item";
import { Badge } from "../ui/badge";
import { getLanguageDisplayName } from "./language-utils";

export interface SortableLanguageItemProps {
  code: string;
  onRemove: () => void;
  canRemove: boolean;
}

export const SortableLanguageItem: FC<SortableLanguageItemProps> = ({ code, onRemove, canRemove }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: code,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <Item size="sm">
        <button
          type="button"
          className="cursor-grab touch-none text-muted-foreground hover:text-foreground"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-4" />
        </button>
        <ItemContent>
          <ItemTitle>
            <span>{getLanguageDisplayName(code)}</span>
            <Badge variant="secondary">{code}</Badge>
          </ItemTitle>
        </ItemContent>
        <ItemActions>
          {canRemove && (
            <button
              type="button"
              onClick={onRemove}
              className="p-1 text-muted-foreground hover:text-destructive"
              aria-label="移除语言"
            >
              <X className="size-4" />
            </button>
          )}
        </ItemActions>
      </Item>
    </div>
  );
};
