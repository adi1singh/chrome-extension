import React, { useState } from 'react';

const Tooltip = ({ children, message }) => {
  const [tooltip, setTooltip] = useState(null);

  const showTooltip = (event) => {
    removeTooltip(); // Remove existing tooltip

    const tooltipElement = document.createElement("div");
    tooltipElement.innerText = message;
    tooltipElement.style.position = "fixed";
    tooltipElement.style.backgroundColor = "black";
    tooltipElement.style.color = "white";
    tooltipElement.style.padding = "5px 10px";
    tooltipElement.style.borderRadius = "5px";
    tooltipElement.style.fontSize = "12px";
    tooltipElement.style.zIndex = "99999";
    tooltipElement.style.top = `${event.clientY + 10}px`;
    tooltipElement.style.left = `${event.clientX + 10}px`;
    tooltipElement.style.pointerEvents = "none";
    tooltipElement.id = "comingSoonTooltip";

    document.body.appendChild(tooltipElement);
    setTooltip(tooltipElement);
  };

  const removeTooltip = () => {
    const existingTooltip = document.getElementById("comingSoonTooltip");
    if (existingTooltip) {
      existingTooltip.remove();
    }
    setTooltip(null);
  };

  const updateTooltipPosition = (event) => {
    if (tooltip) {
      tooltip.style.top = `${event.clientY + 10}px`;
      tooltip.style.left = `${event.clientX + 10}px`;
    }
  };

  return React.cloneElement(children, {
    onMouseOver: showTooltip,
    onMouseMove: updateTooltipPosition,
    onMouseOut: removeTooltip
  });
};

export default Tooltip;
