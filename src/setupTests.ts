import "@testing-library/jest-dom";

// JSDOM does not implement scrollIntoView; Radix UI Select needs it.
window.HTMLElement.prototype.scrollIntoView = () => {};
