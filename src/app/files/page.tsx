"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  FolderOpen,
  File,
  Image,
  FileText,
  Music,
  Video,
  Archive,
  Download,
  Trash2,
  Upload,
  FolderPlus,
  ChevronRight,
  Home,
  RefreshCw,
  X,
  ArrowUpDown,
  Filter,
  Grid,
  List,
} from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { LoadingSpinner, ErrorState } from "@/components/LoadingState";
import { Select } from "@/components/Select";
import { useToast } from "@/components/Toast";
import { useConfirm } from "@/components/ConfirmDialog";
import { SygenAPI } from "@/lib/api";
import type { FileEntry } from "@/lib/api";
import type { Agent } from "@/lib/mock-data";
import { cn } from "@/lib/utils";
import { useUrlSelection } from "@/hooks/useUrlSelection";

type ViewMode = "list" | "grid";
type TypeFilter = "" | "image" | "document" | "audio" | "video" | "archive";
type SortBy = "name" | "size" | "date";

function getFileIcon(entry: FileEntry) {
  if (entry.isDir) return FolderOpen;
  const mime = entry.mime;
  if (mime.startsWith("image/")) return Image;
  if (mime.startsWith("audio/")) return Music;
  if (mime.startsWith("video/")) return Video;
  if (
    mime.includes("zip") ||
    mime.includes("tar") ||
    mime.includes("rar") ||
    mime.includes("7z") ||
    mime.includes("gzip") ||
    mime.includes("bzip")
  )
    return Archive;
  if (
    mime.startsWith("text/") ||
    mime.includes("pdf") ||
    mime.includes("document") ||
    mime.includes("json") ||
    mime.includes("xml")
  )
    return FileText;
  return File;
}

function getFileIconColor(entry: FileEntry): string {
  if (entry.isDir) return "text-brand-400";
  const mime = entry.mime;
  if (mime.startsWith("image/")) return "text-pink-400";
  if (mime.startsWith("audio/")) return "text-purple-400";
  if (mime.startsWith("video/")) return "text-blue-400";
  if (
    mime.includes("zip") ||
    mime.includes("tar") ||
    mime.includes("rar") ||
    mime.includes("7z")
  )
    return "text-yellow-400";
  return "text-text-secondary";
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatRelativeTime(timestamp: number): string {
  const now = Date.now() / 1000;
  const diff = now - timestamp;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 172800) return "yesterday";
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(timestamp * 1000).toLocaleDateString();
}

function isPreviewable(mime: string): boolean {
  return mime.startsWith("image/");
}

export default function FilesPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedAgent, setSelectedAgent] = useState("main");
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("");
  const [sortBy, setSortBy] = useState<SortBy>("name");
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const { success: toastSuccess, error: toastError } = useToast();
  const { confirm } = useConfirm();
  const { t } = useTranslation();

  const subPath = searchParams.get("path") ?? "";
  const currentPath = subPath ? subPath.split("/") : [];

  const setCurrentPath = useCallback(
    (segments: string[]) => {
      const params = new URLSearchParams(searchParams.toString());
      const joined = segments.join("/");
      if (joined) {
        params.set("path", joined);
      } else {
        params.delete("path");
      }
      params.delete("preview");
      const qs = params.toString();
      router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [searchParams, router, pathname],
  );

  const {
    selected: previewFile,
    select: selectPreview,
    clear: clearPreview,
  } = useUrlSelection<FileEntry>("preview", files, (f) => f.path);

  const loadAgents = useCallback(async () => {
    try {
      const data = await SygenAPI.getAgents();
      setAgents(data);
    } catch {
      // ignore
    }
  }, []);

  const loadFiles = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await SygenAPI.listFiles({
        agent: selectedAgent,
        path: subPath,
        type: typeFilter,
        sort: sortBy,
      });
      setFiles(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load files");
    } finally {
      setLoading(false);
    }
  }, [selectedAgent, subPath, typeFilter, sortBy]);

  useEffect(() => {
    loadAgents();
  }, [loadAgents]);

  useEffect(() => {
    loadFiles();
  }, [loadFiles]);

  const handleAgentSelect = (agent: string) => {
    setSelectedAgent(agent);
    setCurrentPath([]);
  };

  const handleNavigate = (entry: FileEntry) => {
    if (entry.isDir) {
      setCurrentPath([...currentPath, entry.name]);
    } else if (isPreviewable(entry.mime)) {
      selectPreview(entry);
    }
  };

  const handleBreadcrumb = (index: number) => {
    setCurrentPath(currentPath.slice(0, index));
  };

  const handleDownload = (entry: FileEntry) => {
    const home = `${process.env.HOME || "/Users/aiagent"}/.sygen`;
    const agentBase =
      selectedAgent === "main" || selectedAgent === "shared"
        ? `${home}/workspace`
        : `${home}/agents/${selectedAgent}/workspace`;
    const fullPath = `${agentBase}/${entry.path}`;
    const url = SygenAPI.getFileDownloadUrl(fullPath);
    window.open(url, "_blank");
  };

  const handleDelete = async (entry: FileEntry) => {
    if (
      !(await confirm({
        message: `${t("files.deleteConfirm")} "${entry.name}"`,
        variant: "danger",
      }))
    )
      return;

    const home = `${process.env.HOME || "/Users/aiagent"}/.sygen`;
    const agentBase =
      selectedAgent === "main" || selectedAgent === "shared"
        ? `${home}/workspace`
        : `${home}/agents/${selectedAgent}/workspace`;
    const fullPath = `${agentBase}/${entry.path}`;

    try {
      await SygenAPI.deleteFile(fullPath);
      toastSuccess(`${entry.name} deleted`);
      if (previewFile?.path === entry.path) clearPreview();
      loadFiles();
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Delete failed");
    }
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    setCreatingFolder(true);
    try {
      const folderPath = subPath
        ? `${subPath}/${newFolderName.trim()}`
        : newFolderName.trim();
      await SygenAPI.createFolder(selectedAgent, folderPath);
      toastSuccess(`Folder "${newFolderName.trim()}" created`);
      setNewFolderName("");
      setShowNewFolder(false);
      loadFiles();
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Create folder failed");
    } finally {
      setCreatingFolder(false);
    }
  };

  const handleUploadFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    setUploading(true);
    try {
      for (let i = 0; i < fileList.length; i++) {
        await SygenAPI.uploadFile(selectedAgent, subPath, fileList[i]);
      }
      toastSuccess(
        `${fileList.length} file${fileList.length > 1 ? "s" : ""} uploaded`
      );
      loadFiles();
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    handleUploadFiles(e.dataTransfer.files);
  };

  const typeFilters: { label: string; value: TypeFilter }[] = [
    { label: t("files.allTypes"), value: "" },
    { label: t("files.images"), value: "image" },
    { label: t("files.documents"), value: "document" },
    { label: t("files.audio"), value: "audio" },
    { label: t("files.video"), value: "video" },
    { label: t("files.archives"), value: "archive" },
  ];

  const sortOptions: { label: string; value: SortBy }[] = [
    { label: t("files.sortName"), value: "name" },
    { label: t("files.sortSize"), value: "size" },
    { label: t("files.sortDate"), value: "date" },
  ];

  return (
    <div className="flex gap-6 h-full">
      {/* Agent sidebar */}
      <div className="w-48 shrink-0 hidden lg:block">
        <h2 className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-3">
          {t("common.agent")}
        </h2>
        <div className="space-y-1">
          {[
            { name: "main", displayName: "Main" },
            ...agents
              .filter((a) => a.name !== "main")
              .map((a) => ({ name: a.name, displayName: a.displayName })),
          ].map((a) => (
            <button
              key={a.name}
              type="button"
              onClick={() => handleAgentSelect(a.name)}
              className={cn(
                "w-full text-left px-3 py-2 rounded-lg text-sm transition-colors",
                selectedAgent === a.name
                  ? "bg-accent text-accent-foreground"
                  : "text-text-secondary hover:text-text-primary hover:bg-white/5"
              )}
            >
              {a.displayName || a.name}
            </button>
          ))}
        </div>
      </div>

      {/* Main content */}
      <div
        className="flex-1 min-w-0"
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold">{t("files.title")}</h1>
          <div className="flex items-center gap-2">
            {/* Agent selector (mobile) */}
            <Select
              value={selectedAgent}
              onChange={(e) => handleAgentSelect(e.target.value)}
              className="lg:hidden"
            >
              <option value="main">Main</option>
              {agents
                .filter((a) => a.name !== "main")
                .map((a) => (
                  <option key={a.name} value={a.name}>
                    {a.displayName || a.name}
                  </option>
                ))}
            </Select>

            <button
              type="button"
              onClick={() => setShowNewFolder(true)}
              className="flex items-center gap-1.5 px-3 py-2 text-sm text-text-secondary hover:text-text-primary hover:bg-bg-card rounded-lg transition-colors"
            >
              <FolderPlus size={14} />
              <span className="hidden sm:inline">{t("files.newFolder")}</span>
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="flex items-center gap-1.5 px-4 py-2 bg-accent hover:bg-accent-hover text-accent-foreground text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
            >
              <Upload size={14} />
              {uploading ? t("files.uploading") : t("files.upload")}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => handleUploadFiles(e.target.files)}
            />
            <button
              type="button"
              onClick={loadFiles}
              className="p-2 hover:bg-bg-card rounded-lg transition-colors text-text-secondary"
            >
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            </button>
          </div>
        </div>

        {/* Breadcrumbs */}
        <div className="flex items-center gap-1 text-sm mb-4 overflow-x-auto">
          <button
            type="button"
            onClick={() => handleBreadcrumb(0)}
            className="flex items-center gap-1 text-text-secondary hover:text-text-primary shrink-0"
          >
            <Home size={14} />
            <span>{selectedAgent}</span>
          </button>
          {currentPath.map((segment, idx) => (
            <div key={idx} className="flex items-center gap-1 shrink-0">
              <ChevronRight size={12} className="text-text-secondary" />
              <button
                type="button"
                onClick={() => handleBreadcrumb(idx + 1)}
                className="text-text-secondary hover:text-text-primary"
              >
                {segment}
              </button>
            </div>
          ))}
        </div>

        {/* Filters & View */}
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <div className="flex items-center gap-1">
            <Filter size={12} className="text-text-secondary" />
            {typeFilters.map((f) => (
              <button
                key={f.value}
                type="button"
                onClick={() => setTypeFilter(f.value)}
                className={cn(
                  "px-2.5 py-1 text-xs font-medium rounded-lg transition-colors",
                  typeFilter === f.value
                    ? "bg-accent text-accent-foreground"
                    : "bg-bg-card text-text-secondary hover:text-text-primary"
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-2">
            <div className="flex items-center gap-1">
              <ArrowUpDown size={12} className="text-text-secondary" />
              <Select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortBy)}
                className="text-xs"
              >
                {sortOptions.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex items-center bg-bg-card border border-border rounded-lg">
              <button
                type="button"
                onClick={() => setViewMode("list")}
                className={cn(
                  "p-1.5 rounded-l-lg transition-colors",
                  viewMode === "list"
                    ? "bg-accent text-accent-foreground"
                    : "text-text-secondary hover:text-text-primary"
                )}
              >
                <List size={14} />
              </button>
              <button
                type="button"
                onClick={() => setViewMode("grid")}
                className={cn(
                  "p-1.5 rounded-r-lg transition-colors",
                  viewMode === "grid"
                    ? "bg-accent text-accent-foreground"
                    : "text-text-secondary hover:text-text-primary"
                )}
              >
                <Grid size={14} />
              </button>
            </div>
          </div>
        </div>

        {/* Drag overlay */}
        {dragOver && (
          <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center pointer-events-none">
            <div className="bg-bg-card border-2 border-dashed border-accent rounded-xl p-12 text-center">
              <Upload size={48} className="mx-auto mb-3 text-accent" />
              <p className="text-lg font-medium">{t("files.dropHere")}</p>
            </div>
          </div>
        )}

        {/* New Folder Dialog */}
        {showNewFolder && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
            onClick={() => setShowNewFolder(false)}
          >
            <div
              className="bg-bg-card border border-border rounded-xl w-full max-w-sm mx-4 shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-5 py-4 border-b border-border">
                <h3 className="font-semibold">{t("files.createFolder")}</h3>
                <button
                  type="button"
                  onClick={() => setShowNewFolder(false)}
                  className="p-1 hover:bg-bg-primary rounded-lg"
                >
                  <X size={16} className="text-text-secondary" />
                </button>
              </div>
              <div className="p-5 space-y-4">
                <div>
                  <label className="block text-xs text-text-secondary mb-1.5">
                    {t("files.folderName")}
                  </label>
                  <input
                    type="text"
                    value={newFolderName}
                    onChange={(e) => setNewFolderName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleCreateFolder()}
                    className="w-full bg-bg-primary border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent"
                    autoFocus
                  />
                </div>
                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowNewFolder(false)}
                    className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary"
                  >
                    {t("common.cancel")}
                  </button>
                  <button
                    type="button"
                    onClick={handleCreateFolder}
                    disabled={creatingFolder || !newFolderName.trim()}
                    className="px-4 py-2 bg-accent hover:bg-accent-hover text-accent-foreground text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
                  >
                    {t("common.create")}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Error */}
        {error && <ErrorState message={error} onRetry={loadFiles} />}

        {/* Loading */}
        {loading && !error ? (
          <div className="flex justify-center py-12">
            <LoadingSpinner />
          </div>
        ) : !error && files.length === 0 ? (
          /* Empty */
          <div className="flex flex-col items-center justify-center py-16 text-text-secondary">
            <FolderOpen size={48} className="mb-3 opacity-30" />
            <p className="text-sm">{t("files.empty")}</p>
          </div>
        ) : viewMode === "list" ? (
          /* List view */
          <div className="bg-bg-card border border-border rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-text-secondary text-xs">
                  <th className="text-left px-4 py-3 font-medium">
                    {t("files.name")}
                  </th>
                  <th className="text-right px-4 py-3 font-medium hidden sm:table-cell">
                    {t("files.size")}
                  </th>
                  <th className="text-right px-4 py-3 font-medium hidden md:table-cell">
                    {t("files.modified")}
                  </th>
                  <th className="text-right px-4 py-3 font-medium w-24">
                    {t("common.actions")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {files.map((entry) => {
                  const Icon = getFileIcon(entry);
                  const iconColor = getFileIconColor(entry);
                  return (
                    <tr
                      key={entry.path}
                      className="border-b border-border last:border-0 hover:bg-white/[0.02] transition-colors"
                    >
                      <td className="px-4 py-2.5">
                        <button
                          type="button"
                          onClick={() => handleNavigate(entry)}
                          className="flex items-center gap-2.5 hover:text-brand-400 transition-colors text-left"
                        >
                          <Icon size={16} className={iconColor} />
                          <span className="truncate max-w-xs">
                            {entry.name}
                          </span>
                        </button>
                      </td>
                      <td className="px-4 py-2.5 text-right text-text-secondary text-xs font-mono hidden sm:table-cell">
                        {entry.isDir ? "—" : formatFileSize(entry.size)}
                      </td>
                      <td className="px-4 py-2.5 text-right text-text-secondary text-xs hidden md:table-cell">
                        {formatRelativeTime(entry.modified)}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <div
                          className="flex items-center justify-end gap-1"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {!entry.isDir && isPreviewable(entry.mime) && (
                            <button
                              type="button"
                              onClick={() => selectPreview(entry)}
                              className="p-1.5 hover:bg-bg-primary rounded-lg text-text-secondary hover:text-text-primary transition-colors"
                              title={t("files.preview")}
                            >
                              <Image size={13} />
                            </button>
                          )}
                          {!entry.isDir && (
                            <button
                              type="button"
                              onClick={() => handleDownload(entry)}
                              className="p-1.5 hover:bg-bg-primary rounded-lg text-text-secondary hover:text-text-primary transition-colors"
                              title={t("files.download")}
                            >
                              <Download size={13} />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleDelete(entry)}
                            className="p-1.5 hover:bg-bg-primary rounded-lg text-text-secondary hover:text-danger transition-colors"
                            title={t("files.delete")}
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          /* Grid view */
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
            {files.map((entry) => {
              const Icon = getFileIcon(entry);
              const iconColor = getFileIconColor(entry);
              const isImage =
                !entry.isDir && entry.mime.startsWith("image/");
              return (
                <div
                  key={entry.path}
                  className="bg-bg-card border border-border rounded-xl p-3 hover:border-accent/50 transition-colors cursor-pointer group relative"
                  onClick={() => handleNavigate(entry)}
                >
                  <div className="aspect-square rounded-lg bg-bg-primary flex items-center justify-center mb-2 overflow-hidden">
                    {isImage ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={SygenAPI.getFileDownloadUrl(
                          `${process.env.HOME || "/Users/aiagent"}/.sygen/${
                            selectedAgent === "main" || selectedAgent === "shared"
                              ? "workspace"
                              : `agents/${selectedAgent}/workspace`
                          }/${entry.path}`
                        )}
                        alt={entry.name}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <Icon size={32} className={iconColor} />
                    )}
                  </div>
                  <p className="text-xs font-medium truncate" title={entry.name}>
                    {entry.name}
                  </p>
                  <p className="text-[10px] text-text-secondary mt-0.5">
                    {entry.isDir
                      ? "Folder"
                      : formatFileSize(entry.size)}
                  </p>
                  {/* Hover actions */}
                  <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                    {!entry.isDir && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDownload(entry);
                        }}
                        className="p-1 bg-bg-card/90 border border-border rounded text-text-secondary hover:text-text-primary"
                      >
                        <Download size={11} />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(entry);
                      }}
                      className="p-1 bg-bg-card/90 border border-border rounded text-text-secondary hover:text-danger"
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Preview panel */}
      {previewFile && (
        <div className="w-80 bg-bg-card border border-border rounded-xl shrink-0 hidden xl:flex flex-col h-fit sticky top-8 max-h-[calc(100vh-6rem)]">
          <div className="flex items-center justify-between p-4 border-b border-border">
            <h3 className="font-semibold text-sm truncate">
              {previewFile.name}
            </h3>
            <button
              type="button"
              onClick={() => clearPreview()}
              className="p-1 hover:bg-bg-primary rounded-lg"
            >
              <X size={14} className="text-text-secondary" />
            </button>
          </div>
          <div className="p-4 space-y-4">
            {isPreviewable(previewFile.mime) && (
              <div className="rounded-lg overflow-hidden bg-bg-primary">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={SygenAPI.getFileDownloadUrl(
                    `${process.env.HOME || "/Users/aiagent"}/.sygen/${
                      selectedAgent === "main" || selectedAgent === "shared"
                        ? "workspace"
                        : `agents/${selectedAgent}/workspace`
                    }/${previewFile.path}`
                  )}
                  alt={previewFile.name}
                  className="w-full"
                />
              </div>
            )}
            <div>
              <p className="text-xs text-text-secondary mb-1">
                {t("files.size")}
              </p>
              <p className="text-sm">{formatFileSize(previewFile.size)}</p>
            </div>
            <div>
              <p className="text-xs text-text-secondary mb-1">
                {t("files.type")}
              </p>
              <p className="text-sm font-mono text-xs">{previewFile.mime}</p>
            </div>
            <div>
              <p className="text-xs text-text-secondary mb-1">
                {t("files.modified")}
              </p>
              <p className="text-sm">
                {new Date(previewFile.modified * 1000).toLocaleString()}
              </p>
            </div>
            <div className="flex gap-2 pt-2 border-t border-border">
              <button
                type="button"
                onClick={() => handleDownload(previewFile)}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium rounded-lg bg-brand-500/20 text-brand-400 hover:bg-brand-500/30 transition-colors"
              >
                <Download size={12} />
                {t("files.download")}
              </button>
              <button
                type="button"
                onClick={() => handleDelete(previewFile)}
                className="flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg bg-danger/20 text-danger hover:bg-danger/30 transition-colors"
              >
                <Trash2 size={12} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
