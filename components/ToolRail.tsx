"use client";

import type { ComponentType } from "react";
import type { Tool } from "@/lib/types";
import {
  MoveIcon,
  PointIcon,
  SegmentIcon,
  ShuffleIcon,
  TrashIcon,
  type IconProps,
} from "./Icons";

interface ToolRailProps {
  tool: Tool;
  selectedId: string | null;
  onToolChange: (tool: Tool) => void;
  onDelete: () => void;
  onShuffle: () => void;
}

interface ToolDefinition {
  id: Tool;
  label: string;
  shortcut: string;
  hint: string;
  icon: ComponentType<IconProps>;
}

const TOOLS: ToolDefinition[] = [
  {
    id: "move",
    label: "移動",
    shortcut: "V",
    hint: "星をドラッグして動かす",
    icon: MoveIcon,
  },
  {
    id: "star",
    label: "点",
    shortcut: "P",
    hint: "空をクリックして星を置く",
    icon: PointIcon,
  },
  {
    id: "line",
    label: "線分",
    shortcut: "L",
    hint: "2つの星を順にクリックして結ぶ",
    icon: SegmentIcon,
  },
];

export default function ToolRail({
  tool,
  selectedId,
  onToolChange,
  onDelete,
  onShuffle,
}: ToolRailProps) {
  return (
    <aside className="toolrail" aria-label="作図ツール">
      <div className="toolrail-group" role="toolbar" aria-label="ツール">
        {TOOLS.map((definition) => {
          const Icon = definition.icon;
          const active = tool === definition.id;
          return (
            <button
              key={definition.id}
              type="button"
              className={`tool-button ${active ? "is-active" : ""}`}
              aria-pressed={active}
              aria-label={`${definition.label}（${definition.hint}）`}
              onClick={() => onToolChange(definition.id)}
            >
              <Icon size={23} />
              <span className="tool-tip" role="presentation">
                <b>{definition.label}</b>
                <span>{definition.hint}</span>
                <kbd>{definition.shortcut}</kbd>
              </span>
            </button>
          );
        })}
      </div>

      <div className="toolrail-divider" aria-hidden="true" />

      <div className="toolrail-group toolrail-utility">
        <button
          type="button"
          className="tool-button subtle"
          onClick={onDelete}
          disabled={!selectedId}
          aria-label="選択した星を削除"
        >
          <TrashIcon size={21} />
          <span className="tool-tip">
            <b>星を削除</b>
            <span>選択中の星と、つながる線を消す</span>
            <kbd>Delete</kbd>
          </span>
        </button>
        <button
          type="button"
          className="tool-button subtle"
          onClick={onShuffle}
          aria-label="6つの星をランダムに配置し直す"
        >
          <ShuffleIcon size={21} />
          <span className="tool-tip">
            <b>星をシャッフル</b>
            <span>6つの星を新しく配置する（元に戻せます）</span>
          </span>
        </button>
      </div>
    </aside>
  );
}
