export class App {
  public vault: any;
  public workspace: any;
  constructor() {
    this.vault = new Vault();
    this.workspace = new Workspace();
  }
}

export class Vault {
  public files = new Map<string, any>();
  public getMarkdownFiles(): TFile[] {
    return Array.from(this.files.values()).filter((f) => f.extension === "md");
  }
  public getAbstractFileByPath(path: string): any {
    return this.files.get(path);
  }
  public async read(file: TFile): Promise<string> {
    return (file as any).content || "";
  }
  public async modify(file: TFile, content: string): Promise<void> {
    (file as any).content = content;
  }
  public on(event: string, callback: (...args: any[]) => any): any {
    return { event, callback };
  }
}

export class Workspace {
  public getLeavesOfType(type: string): WorkspaceLeaf[] {
    return [];
  }
  public getRightLeaf(split: boolean): WorkspaceLeaf | null {
    return new WorkspaceLeaf();
  }
  public revealLeaf(leaf: WorkspaceLeaf): void {}
  public openLinkText(link: string, sourcePath: string): void {}
}

export class WorkspaceLeaf {
  public view: any = null;
  public async setViewState(state: any): Promise<void> {}
}

export class ItemView {
  public leaf: WorkspaceLeaf;
  public contentEl: HTMLElement;
  public app: App;
  constructor(leaf: WorkspaceLeaf) {
    this.leaf = leaf;
    this.contentEl = typeof document !== "undefined" ? document.createElement("div") : ({} as any);
    this.app = new App();
  }
  public getViewType(): string {
    return "";
  }
  public getDisplayText(): string {
    return "";
  }
  public getIcon(): string {
    return "";
  }
  public async onOpen(): Promise<void> {}
  public async onClose(): Promise<void> {}
}

export class Plugin {
  public app: App;
  public manifest: any;
  constructor(app: App, manifest: any) {
    this.app = app;
    this.manifest = manifest;
  }
  public addRibbonIcon(icon: string, title: string, callback: () => void): any {
    return {};
  }
  public addCommand(command: any): any {
    return {};
  }
  public addSettingTab(tab: any): void {}
  public registerView(type: string, viewCreator: any): void {}
  public registerEvent(event: any): void {}
  public async loadData(): Promise<any> {
    return {};
  }
  public async saveData(data: any): Promise<void> {}
}

export class PluginSettingTab {
  public app: App;
  public plugin: any;
  public containerEl: HTMLElement;
  constructor(app: App, plugin: any) {
    this.app = app;
    this.plugin = plugin;
    this.containerEl = typeof document !== "undefined" ? document.createElement("div") : ({} as any);
  }
  public display(): void {}
}

export class Setting {
  public settingEl: HTMLElement;
  constructor(containerEl: HTMLElement) {
    this.settingEl = typeof document !== "undefined" ? document.createElement("div") : ({} as any);
  }
  public setName(name: string): this {
    return this;
  }
  public setDesc(desc: string): this {
    return this;
  }
  public addText(cb: (text: any) => void): this {
    cb({ setPlaceholder: () => ({ setValue: () => ({ onChange: () => ({}) }) }) });
    return this;
  }
  public addSlider(cb: (slider: any) => void): this {
    cb({ setLimits: () => ({ setValue: () => ({ setDynamicTooltip: () => ({ onChange: () => ({}) }) }) }) });
    return this;
  }
  public addToggle(cb: (toggle: any) => void): this {
    cb({ setValue: () => ({ onChange: () => ({}) }) });
    return this;
  }
  public addDropdown(cb: (dropdown: any) => void): this {
    cb({ addOption: () => ({ addOption: () => ({ setValue: () => ({ onChange: () => ({}) }) }) }) });
    return this;
  }
}

export class Notice {
  constructor(message: string, duration?: number) {}
}

export class TAbstractFile {
  public path = "";
  public name = "";
}

export class TFile extends TAbstractFile {
  public basename = "";
  public extension = "md";
  public stat = { size: 0, mtime: 0, ctime: 0 };
}
