import React from "react";
import { Meta, Story } from "@storybook/react";
import { V, location } from "../storybook";
import Rect, { Props } from ".";

export default {
  title: "molecules/Visualizer/Engine/Cesium/Rect",
  component: Rect,
  argTypes: {
    api: {
      control: false,
    },
  },
} as Meta;

export const Default: Story<Props> = args => (
  <V location={location}>
    <Rect {...args} />
  </V>
);

Default.args = {
  primitive: {
    id: "",
    isVisible: true,
    property: {
      default: {
        rect: { west: 139, east: 140, north: 36, south: 35 },
        fillColor: "#f00a",
        extrudedHeight: 10000,
        outlineColor: "yellow",
        outlineWidth: 10,
      },
    },
  },
  isBuilt: false,
  isEditable: false,
  isSelected: false,
};

export const Image: Story<Props> = args => (
  <V location={location}>
    <Rect {...args} />
  </V>
);

Image.args = {
  primitive: {
    id: "",
    isVisible: true,
    property: {
      default: {
        rect: { west: 139, east: 140, north: 36, south: 35 },
        style: "image",
        image: `${process.env.PUBLIC_URL}/sample.png`,
      },
    },
  },
  isBuilt: false,
  isEditable: false,
  isSelected: false,
};