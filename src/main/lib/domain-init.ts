import { registerDomain } from "../../shared/domains/index"
import { developmentDomain } from "../../shared/domains/development-data"
import { contentDomain } from "../../shared/domains/content-data"
import { marketingDomain } from "../../shared/domains/marketing-data"
import { coursesDomain } from "../../shared/domains/courses-data"

// Main process does not score templates — use no-op scoring.
const noOpScore = () => 0

let initialized = false

export function initDomains(): void {
  if (initialized) return
  initialized = true

  registerDomain({ ...developmentDomain, scoreTemplate: noOpScore })
  registerDomain({ ...contentDomain, scoreTemplate: noOpScore })
  registerDomain({ ...marketingDomain, scoreTemplate: noOpScore })
  registerDomain({ ...coursesDomain, scoreTemplate: noOpScore })
}
