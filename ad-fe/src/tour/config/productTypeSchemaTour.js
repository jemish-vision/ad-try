import { tourRegistry } from '../TourRegistry';
import { MagnifyingGlass, Layout, Tabs, ListBullets, HandGrabbing, ArrowLineDown, ArrowRight, XCircle, ListChecks } from "@phosphor-icons/react";

export const productTypeSchemaTour = {
  id: "productTypeSchemaTour",
  steps: [
    {
      target: "#fs-search-area",
      icon: MagnifyingGlass,
      title: "Search Bar",
      content: "Use the search bar to quickly locate specific fields by name or key.",
      blockTargetInteraction: true
    },
    {
      target: "#fs-left-pane",
      icon: Layout,
      title: "Left Sidebar",
      content: "This area displays all the available fields you can add to your product schema.",
      blockTargetInteraction: true
    },
    {
      target: "#fs-tabs-container",
      icon: Tabs,
      title: "Tab View",
      content: "Filter the fields by viewing All Fields, Mandatory fields, or Other optional attributes.",
      blockTargetInteraction: true
    },
    {
      target: "#fs-left-fields-list",
      icon: ListBullets,
      title: "Left Fields",
      content: "Browse the list of available fields. You can click or drag these items to add them to your schema.",
      blockTargetInteraction: true
    },
    {
      target: "#fs-right-pane",
      icon: Layout,
      title: "Right Sidebar",
      content: "This is your Schema Configuration pane where your selected fields will be organized.",
      blockTargetInteraction: true
    },
    {
      target: "#fs-selected-dropzone",
      icon: HandGrabbing,
      title: "Drag & Drop Field",
      content: "You can easily drag fields from the left and drop them into this zone.",
      blockTargetInteraction: true
    },
    {
      target: "#fs-selected-list",
      icon: ListChecks,
      title: "Selected Fields",
      content: "Review all the fields you have selected. You can reorder them or remove optional ones.",
      blockTargetInteraction: true
    },
    {
      target: "#fs-bottom-bar",
      icon: ArrowLineDown,
      title: "Bottom Bar",
      content: "The bottom bar provides quick access to actions regarding your selected fields.",
      blockTargetInteraction: true
    },
    {
      target: "#product-schema-next-btn",
      icon: ArrowRight,
      title: "Save and Continue",
      content: "Once you have selected all desired fields, click this button to generate and fill out your product schema form.",
      blockTargetInteraction: true
    },
    {
      target: "#product-schema-cancel-btn",
      icon: XCircle,
      title: "Cancel",
      content: "Click Cancel if you wish to discard your current selections and go back.",
      blockTargetInteraction: true
    }
  ]
};

tourRegistry.register(productTypeSchemaTour);
