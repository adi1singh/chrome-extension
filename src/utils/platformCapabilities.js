const capabilities = {
  linkedin: { autofill: true, autoApply: true },
  indeed: { autofill: true, autoApply: true },
  seek: { autofill: true, autoApply: true },
  microsoft: { autofill: true, autoApply: false },
  icims: { autofill: true, autoApply: false },
  glassdoor: { autofill: true, autoApply: false }
};

export function platformCapabilities(site) {
  return capabilities[site] || { autofill: false, autoApply: false };
}
