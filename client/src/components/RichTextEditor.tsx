/**
 * Rich Text Editor Component
 * Tiptap-based editor with Montserrat font family support
 * Features: Bold, Italic, Font Size, Lists, and more
 */

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { TextStyle } from "@tiptap/extension-text-style";
import FontFamily from "@tiptap/extension-font-family";
import { Button } from "@/components/ui/button";
import { Bold, Italic, List, ListOrdered, Undo2, Redo2 } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import "./RichTextEditor.css";

interface RichTextEditorProps {
  value: string;
  onChange: (content: string) => void;
  placeholder?: string;
  minHeight?: string;
}

export function RichTextEditor({
  value,
  onChange,
  placeholder = "Digite o conteúdo da prescrição...",
  minHeight = "200px",
}: RichTextEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3],
        },
      }),
      TextStyle,
      FontFamily.configure({
        types: ["textStyle"],
      }),
    ],
    content: value,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class:
          "prose prose-sm max-w-none focus:outline-none p-4 rounded-lg border border-input bg-background text-foreground",
        style: `font-family: 'Montserrat', sans-serif; min-height: ${minHeight}; font-size: 14px;`,
      },
    },
  });

  if (!editor) {
    return null;
  }

  const fontSizes = ["12px", "14px", "16px", "18px", "20px", "24px"];

  return (
    <div className="space-y-2 border rounded-lg overflow-hidden bg-background">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 p-3 border-b bg-muted/30">
        {/* Font Size Selector */}
        <Select
          value={
            editor.getAttributes("textStyle").fontSize || "14px"
          }
          onValueChange={(size) => {
            editor.chain().focus().setFontSize(size).run();
          }}
        >
          <SelectTrigger className="w-24 h-9">
            <SelectValue placeholder="Tamanho" />
          </SelectTrigger>
          <SelectContent>
            {fontSizes.map((size) => (
              <SelectItem key={size} value={size}>
                {size}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Divider */}
        <div className="w-px h-6 bg-border" />

        {/* Bold Button */}
        <Button
          size="sm"
          variant={editor.isActive("bold") ? "default" : "outline"}
          onClick={() => editor.chain().focus().toggleBold().run()}
          className="h-9 w-9 p-0"
          title="Negrito (Ctrl+B)"
        >
          <Bold className="h-4 w-4" />
        </Button>

        {/* Italic Button */}
        <Button
          size="sm"
          variant={editor.isActive("italic") ? "default" : "outline"}
          onClick={() => editor.chain().focus().toggleItalic().run()}
          className="h-9 w-9 p-0"
          title="Itálico (Ctrl+I)"
        >
          <Italic className="h-4 w-4" />
        </Button>

        {/* Divider */}
        <div className="w-px h-6 bg-border" />

        {/* Bullet List Button */}
        <Button
          size="sm"
          variant={
            editor.isActive("bulletList") ? "default" : "outline"
          }
          onClick={() =>
            editor.chain().focus().toggleBulletList().run()
          }
          className="h-9 w-9 p-0"
          title="Lista com Marcadores"
        >
          <List className="h-4 w-4" />
        </Button>

        {/* Ordered List Button */}
        <Button
          size="sm"
          variant={
            editor.isActive("orderedList") ? "default" : "outline"
          }
          onClick={() =>
            editor.chain().focus().toggleOrderedList().run()
          }
          className="h-9 w-9 p-0"
          title="Lista Numerada"
        >
          <ListOrdered className="h-4 w-4" />
        </Button>

        {/* Divider */}
        <div className="w-px h-6 bg-border" />

        {/* Undo Button */}
        <Button
          size="sm"
          variant="outline"
          onClick={() => editor.chain().focus().undo().run()}
          disabled={!editor.can().undo()}
          className="h-9 w-9 p-0"
          title="Desfazer (Ctrl+Z)"
        >
          <Undo2 className="h-4 w-4" />
        </Button>

        {/* Redo Button */}
        <Button
          size="sm"
          variant="outline"
          onClick={() => editor.chain().focus().redo().run()}
          disabled={!editor.can().redo()}
          className="h-9 w-9 p-0"
          title="Refazer (Ctrl+Y)"
        >
          <Redo2 className="h-4 w-4" />
        </Button>
      </div>

      {/* Editor Content */}
      <EditorContent editor={editor} />

      {/* Character Count */}
      <div className="px-3 pb-2 text-xs text-muted-foreground">
        {editor.storage.characterCount?.characters() || 0} caracteres
      </div>
    </div>
  );
}
