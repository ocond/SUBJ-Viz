"""Request and response models of the SUBJ-Viz API (camelCase on the wire)."""

from __future__ import annotations

from typing import List, Literal, Optional, Tuple

from pydantic import BaseModel, ConfigDict, Field, model_validator
from pydantic.alias_generators import to_camel

# Accepted deviation of mass sums from 1 (rounding errors of the frontend)
TOLERANCE = 1e-6
MAX_DIMENSION = 10
MAX_SOURCES = 8
MAX_PDF_RESOLUTION = 400


class ApiModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class OpinionIn(ApiModel):
    """A multinomial opinion. Binomial opinions are given as belief = [b, d], baseRate = [a, 1 - a]."""

    belief: List[float] = Field(min_length=2, max_length=MAX_DIMENSION)
    uncertainty: float
    base_rate: List[float]

    @model_validator(mode="after")
    def _validate_and_normalize(self) -> "OpinionIn":
        if len(self.base_rate) != len(self.belief):
            raise ValueError("belief and baseRate must have the same length")

        masses = self.belief + [self.uncertainty]
        if min(masses) < -TOLERANCE:
            raise ValueError("belief and uncertainty masses must be non-negative")
        if abs(sum(masses) - 1.0) > TOLERANCE:
            raise ValueError(f"belief and uncertainty masses must sum to 1, got {sum(masses):.6g}")
        if min(self.base_rate) < -TOLERANCE:
            raise ValueError("base rates must be non-negative")
        if abs(sum(self.base_rate) - 1.0) > TOLERANCE:
            raise ValueError(f"base rates must sum to 1, got {sum(self.base_rate):.6g}")

        # Remove rounding errors, SUBJ expects exactly additive masses
        belief = [max(b, 0.0) for b in self.belief]
        total = sum(belief) + max(self.uncertainty, 0.0)
        self.belief = [b / total for b in belief]
        self.uncertainty = max(1.0 - sum(self.belief), 0.0)
        base_rate = [max(a, 0.0) for a in self.base_rate]
        self.base_rate = [a / sum(base_rate) for a in base_rate]
        return self

    @property
    def dim(self) -> int:
        return len(self.belief)


class Pdf(ApiModel):
    """Samples of the Dirichlet PDF of an opinion.

    kind:
      beta        dim 2, density over x = p(x_1) in `density`
      dirichlet3  dim 3, triangular grid of `resolution`; each cell is (i, j, down, density),
                  see subjviz.pdf.dirichlet_cells for the geometry
      marginals   dim > 3, Beta marginal densities of every state over `x`
      dogmatic    u = 0, the PDF is a Dirac delta at `point`
    """

    kind: Literal["beta", "dirichlet3", "marginals", "dogmatic"]
    x: Optional[List[float]] = None
    density: Optional[List[Optional[float]]] = None
    marginals: Optional[List[List[Optional[float]]]] = None
    resolution: Optional[int] = None
    cells: Optional[List[Tuple[int, int, int, Optional[float]]]] = None
    point: Optional[List[float]] = None


class OpinionOut(ApiModel):
    belief: List[float]
    uncertainty: float
    base_rate: List[float]
    projection: List[float]
    variance: List[float]
    uncertainty_maximum: float
    prior_weight: float
    # Dirichlet strength alpha; absent for dogmatic opinions (infinite evidence)
    strength: Optional[List[float]] = None
    # False if the masses are negative or exceed 1 (e.g. undefined unfusion)
    valid: bool
    pdf: Optional[Pdf] = None


class PdfOptions(ApiModel):
    pdf: bool = False
    pdf_resolution: Optional[int] = Field(default=None, ge=4, le=MAX_PDF_RESOLUTION)


class OpinionRequest(PdfOptions):
    opinions: List[OpinionIn] = Field(min_length=1, max_length=MAX_SOURCES)


class OpinionResponse(ApiModel):
    opinions: List[OpinionOut]


class DeductionRequest(PdfOptions):
    antecedent: OpinionIn
    conditionals: List[OpinionIn] = Field(min_length=2, max_length=MAX_DIMENSION)

    @model_validator(mode="after")
    def _validate_dimensions(self) -> "DeductionRequest":
        if len(self.conditionals) != self.antecedent.dim:
            raise ValueError("one conditional opinion per antecedent state is required")
        if len({c.dim for c in self.conditionals}) != 1:
            raise ValueError("all conditional opinions must have the same dimension")
        return self


class DeductionResponse(ApiModel):
    antecedent: OpinionOut
    conditionals: List[OpinionOut]
    result: OpinionOut
    # Deduced opinion for a vacuous antecedent: apex of the sub-simplex spanned by the conditionals
    apex: OpinionOut
    # Deduced opinions for the dogmatic antecedents x_i: the conditionals with the marginal base rate
    vertices: List[OpinionOut]
    marginal_base_rate: List[float]


class FusionRequest(PdfOptions):
    method: Literal["cumulative", "averaging"]
    opinions: List[OpinionIn] = Field(min_length=2, max_length=MAX_SOURCES)

    @model_validator(mode="after")
    def _validate_dimensions(self) -> "FusionRequest":
        if len({o.dim for o in self.opinions}) != 1:
            raise ValueError("all opinions must have the same dimension")
        return self


class FusionResponse(ApiModel):
    opinions: List[OpinionOut]
    result: OpinionOut


class UnfusionRequest(PdfOptions):
    fused: OpinionIn
    opinion: OpinionIn
    # Base rate of the unfused opinion, defaults to the base rate of the fused opinion
    base_rate: Optional[List[float]] = None

    @model_validator(mode="after")
    def _validate_dimensions(self) -> "UnfusionRequest":
        if self.fused.dim != self.opinion.dim:
            raise ValueError("fused and contributing opinion must have the same dimension")
        if self.base_rate is not None:
            if len(self.base_rate) != self.fused.dim:
                raise ValueError("baseRate must match the dimension of the opinions")
            if min(self.base_rate) < -TOLERANCE or abs(sum(self.base_rate) - 1.0) > TOLERANCE:
                raise ValueError("base rates must be non-negative and sum to 1")
        return self


class UnfusionResponse(ApiModel):
    fused: OpinionOut
    opinion: OpinionOut
    # Absent if the unfusion is undefined (division by zero)
    result: Optional[OpinionOut] = None
    # Cumulative fusion of the result with the contributing opinion; equals `fused` if valid
    refused: Optional[OpinionOut] = None
    message: Optional[str] = None


class TrustDiscountingRequest(PdfOptions):
    # Binomial trust opinion of the analyst A about the source B
    trust: OpinionIn
    # Opinion of the source B about X
    opinion: OpinionIn

    @model_validator(mode="after")
    def _validate_trust(self) -> "TrustDiscountingRequest":
        if self.trust.dim != 2:
            raise ValueError("the trust opinion must be binomial")
        return self


class TrustDiscountingResponse(ApiModel):
    trust: OpinionOut
    opinion: OpinionOut
    trust_probability: float
    result: OpinionOut


class MultiplicationRequest(PdfOptions):
    x: OpinionIn
    y: OpinionIn


class MultiplicationResponse(ApiModel):
    x: OpinionOut
    y: OpinionOut
    # Opinion over X x Y; element (i, j) is at index i * shape[1] + j
    result: OpinionOut
    shape: Tuple[int, int]


class InfoResponse(ApiModel):
    subjviz_version: str
    pysubj_version: str
    patches: List[str]
