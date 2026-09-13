import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { arrayMove, SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Plus } from "lucide-react";
import { type FC, useMemo, useState } from "react";
import { Item, ItemContent, ItemDescription, ItemTitle } from "@/components/ui/item";
import { NativeSelect, NativeSelectOptGroup, NativeSelectOption } from "@/components/ui/native-select";
import { Badge } from "../ui/badge";
import { getAllLanguages, getCountriesForLanguage } from "./language-utils";
import { SortableLanguageItem } from "./sortable-language-item";

interface TmdbLanguageSortableProps {
  value: string[];
  onChange: (languages: string[]) => void;
}

export const TmdbLanguageSortable: FC<TmdbLanguageSortableProps> = ({ value, onChange }) => {
  const [selectedLang, setSelectedLang] = useState("");
  const [selectedCountry, setSelectedCountry] = useState("");

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor),
  );

  const allLanguages = useMemo(() => getAllLanguages(), []);

  // 获取选中语言对应的国家列表
  const countriesForLang = useMemo(() => (selectedLang ? getCountriesForLanguage(selectedLang) : []), [selectedLang]);

  // 计算最终要添加的语言代码
  const codeToAdd = useMemo(() => {
    if (!selectedLang) return "";
    if (selectedCountry) return `${selectedLang}-${selectedCountry}`;
    return selectedLang;
  }, [selectedLang, selectedCountry]);

  // 是否已存在
  const alreadyExists = value.includes(codeToAdd);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const activeId = String(active.id);
    const overId = String(over.id);

    const oldIndex = value.indexOf(activeId);
    const newIndex = value.indexOf(overId);

    if (oldIndex !== -1 && newIndex !== -1) {
      onChange(arrayMove(value, oldIndex, newIndex));
    }
  };

  const handleAdd = () => {
    if (codeToAdd && !alreadyExists) {
      let newValue = [...value, codeToAdd];
      // 如果列表中有 null，将其移到最后
      if (newValue.includes("null") && codeToAdd !== "null") {
        newValue = [...newValue.filter((c) => c !== "null"), "null"];
      }
      onChange(newValue);
      setSelectedLang("");
      setSelectedCountry("");
    }
  };

  const handleRemove = (code: string) => {
    // 至少保留一个语言
    if (value.length <= 1) return;
    onChange(value.filter((c) => c !== code));
  };

  // 处理语言选择变化
  const handleLangChange = (lang: string) => {
    setSelectedLang(lang);
    setSelectedCountry(""); // 重置国家选择
  };

  return (
    <Item size="sm">
      <ItemContent className="flex-1">
        <ItemTitle className="mb-2">图片语言偏好</ItemTitle>

        <div className="rounded-md border bg-muted/30" data-vaul-no-drag>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={value} strategy={verticalListSortingStrategy}>
              {value.map((code) => (
                <SortableLanguageItem
                  key={code}
                  code={code}
                  onRemove={() => handleRemove(code)}
                  canRemove={value.length > 1}
                />
              ))}
            </SortableContext>
          </DndContext>
        </div>

        {/* 两步添加语言 */}
        <div className="mt-3 space-y-2">
          <div className="flex items-center gap-2">
            {/* 第一步：选择语言 */}
            <NativeSelect className="flex-1" value={selectedLang} onChange={(e) => handleLangChange(e.target.value)}>
              <NativeSelectOption value="">选择语言...</NativeSelectOption>
              <NativeSelectOptGroup label="常用语言">
                {["zh", "en", "ja", "ko", "es", "fr", "de", "pt", "ru", "it"].map((code) => {
                  const lang = allLanguages.find((l) => l.code === code);
                  return lang ? (
                    <NativeSelectOption key={code} value={code}>
                      {lang.code}（{lang.native}）
                    </NativeSelectOption>
                  ) : null;
                })}
              </NativeSelectOptGroup>
              <NativeSelectOptGroup label="所有语言">
                {allLanguages.map((lang) => (
                  <NativeSelectOption key={lang.code} value={lang.code}>
                    {lang.code}（{lang.native}）
                  </NativeSelectOption>
                ))}
              </NativeSelectOptGroup>
              <NativeSelectOptGroup label="特殊">
                <NativeSelectOption value="null">无语言标签 (No Language)</NativeSelectOption>
              </NativeSelectOptGroup>
            </NativeSelect>

            {/* 第二步：选择国家（可选） */}
            {selectedLang && selectedLang !== "null" && countriesForLang.length > 0 && (
              <NativeSelect
                className="flex-1"
                value={selectedCountry}
                onChange={(e) => setSelectedCountry(e.target.value)}
              >
                <NativeSelectOption value="">不指定国家/地区</NativeSelectOption>
                {countriesForLang.map((country) => (
                  <NativeSelectOption key={country.code} value={country.code}>
                    {country.code}（{country.native}）
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            )}

            <button
              type="button"
              onClick={handleAdd}
              disabled={!codeToAdd || alreadyExists}
              className="flex h-9 shrink-0 items-center gap-1 rounded-md border bg-background px-3 text-sm disabled:opacity-50"
            >
              <Plus className="size-4" />
              添加
            </button>
          </div>

          {/* 预览要添加的代码 */}
          {codeToAdd && (
            <ItemDescription>
              将添加: <Badge variant="secondary">{codeToAdd}</Badge>
              {alreadyExists && <Badge variant="destructive">已存在</Badge>}
            </ItemDescription>
          )}
        </div>

        <ItemDescription>拖动排序调整优先级，排在前面的语言将优先使用</ItemDescription>
      </ItemContent>
    </Item>
  );
};
