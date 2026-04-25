import { LitElement, html } from "lit";
import { property } from "lit/decorators.js";
import { groupTitleForTab, titleForTab, type Tab } from "../navigation.js";

export class DashboardHeader extends LitElement {
  override createRenderRoot() {
    return this;
  }

  @property() tab: Tab = "overview";

  override render() {
    const label = titleForTab(this.tab);
    const group = groupTitleForTab(this.tab);

    return html`
      <div class="dashboard-header">
        <div class="dashboard-header__breadcrumb">
          <span class="dashboard-header__breadcrumb-link">${group}</span>
          <span class="dashboard-header__breadcrumb-sep">›</span>
          <span class="dashboard-header__breadcrumb-current">${label}</span>
        </div>
        <div class="dashboard-header__actions">
          <slot></slot>
        </div>
      </div>
    `;
  }
}

if (!customElements.get("dashboard-header")) {
  customElements.define("dashboard-header", DashboardHeader);
}
