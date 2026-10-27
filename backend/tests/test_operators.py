import pytest

from conftest import binomial, opinion, post


def fuse(client, method, *opinions):
    return post(client, "/api/fusion", {"method": method, "opinions": list(opinions)})["result"]


def evidence(op):
    """r / W = b / u, which cumulative fusion adds and averaging fusion averages."""
    return [b / op["uncertainty"] for b in op["belief"]]


A = opinion([0.5, 0.1, 0.1], 0.3, [0.2, 0.3, 0.5])
B = opinion([0.1, 0.4, 0.0], 0.5, [0.2, 0.3, 0.5])
C = opinion([0.2, 0.2, 0.2], 0.4, [0.2, 0.3, 0.5])


def test_cumulative_fusion_adds_evidence(client):
    result = fuse(client, "cumulative", A, B)
    assert evidence(result) == pytest.approx([a + b for a, b in zip(evidence(A), evidence(B))])
    assert result == fuse(client, "cumulative", B, A)


def test_cumulative_fusion_of_three_sources_adds_evidence(client):
    result = fuse(client, "cumulative", A, B, C)
    assert evidence(result) == pytest.approx(
        [a + b + c for a, b, c in zip(evidence(A), evidence(B), evidence(C))]
    )


def test_averaging_fusion_averages_evidence(client):
    result = fuse(client, "averaging", A, B)
    assert evidence(result) == pytest.approx([(a + b) / 2 for a, b in zip(evidence(A), evidence(B))])
    assert sum(result["belief"]) + result["uncertainty"] == pytest.approx(1.0)


@pytest.mark.parametrize("method", ["cumulative", "averaging"])
def test_fusion_with_vacuous_opinion(client, method):
    result = fuse(client, method, A, opinion([0, 0, 0], 1.0, [0.2, 0.3, 0.5]))
    if method == "cumulative":
        assert result["belief"] == pytest.approx(A["belief"])
    else:
        assert result["uncertainty"] > A["uncertainty"]


@pytest.mark.parametrize("method", ["cumulative", "averaging"])
def test_fusion_with_dogmatic_sources(client, method):
    dogmatic_1 = binomial(0.7, 0.3, 0.0)
    dogmatic_2 = binomial(0.3, 0.7, 0.0)
    uncertain = binomial(0.2, 0.2, 0.6)

    one = fuse(client, method, dogmatic_1, uncertain)
    assert one["belief"] == pytest.approx([0.7, 0.3])
    assert one["uncertainty"] == pytest.approx(0.0)

    two = fuse(client, method, dogmatic_1, dogmatic_2, uncertain)
    assert two["belief"] == pytest.approx([0.5, 0.5])


@pytest.mark.parametrize("method", ["cumulative", "averaging"])
def test_fusion_of_vacuous_opinions_averages_base_rates(client, method):
    result = fuse(client, method, binomial(0, 0, 1, 0.2), binomial(0, 0, 1, 0.6))
    assert result["uncertainty"] == pytest.approx(1.0)
    assert result["baseRate"] == pytest.approx([0.4, 0.6])


def test_unfusion_inverts_cumulative_fusion(client):
    fused = fuse(client, "cumulative", A, B)
    fused_in = {k: fused[k] for k in ("belief", "uncertainty", "baseRate")}
    response = post(
        client, "/api/unfusion", {"fused": fused_in, "opinion": B, "baseRate": A["baseRate"]}
    )
    assert response["result"]["valid"]
    assert response["result"]["belief"] == pytest.approx(A["belief"])
    assert response["result"]["uncertainty"] == pytest.approx(A["uncertainty"])
    assert response["refused"]["belief"] == pytest.approx(fused["belief"])


def test_unfusion_reports_invalid_results(client):
    response = post(
        client, "/api/unfusion", {"fused": binomial(0.1, 0.1, 0.8), "opinion": binomial(0.6, 0.1, 0.3)}
    )
    assert response["result"]["valid"] is False
    assert "refused" not in response
    assert "no valid opinion" in response["message"]


def test_unfusion_of_dogmatic_opinions_is_undefined(client):
    response = post(
        client, "/api/unfusion", {"fused": binomial(0.5, 0.5, 0.0), "opinion": binomial(0.6, 0.4, 0.0)}
    )
    assert "result" not in response
    assert "undefined" in response["message"]


@pytest.mark.parametrize("trust", [binomial(0.6, 0.1, 0.3, 0.4), binomial(1, 0, 0), binomial(0, 1, 0)])
def test_trust_discounting_moves_towards_vacuous_opinion(client, trust):
    response = post(client, "/api/trust-discounting", {"trust": trust, "opinion": A})
    p = response["trustProbability"]
    assert p == pytest.approx(trust["belief"][0] + trust["baseRate"][0] * trust["uncertainty"])
    # The discounted opinion is p * omega + (1 - p) * vacuous opinion
    result = response["result"]
    assert result["belief"] == pytest.approx([p * b for b in A["belief"]])
    assert result["uncertainty"] == pytest.approx(p * A["uncertainty"] + 1 - p)
    assert result["baseRate"] == pytest.approx(A["baseRate"])


def test_trust_opinion_must_be_binomial(client):
    response = client.post("/api/trust-discounting", json={"trust": A, "opinion": A})
    assert response.status_code == 422


@pytest.mark.parametrize(
    "x, y",
    [
        (binomial(0.6, 0.2, 0.2), binomial(0.3, 0.3, 0.4, 0.4)),
        (binomial(0.0, 0.0, 1.0), opinion([0.0, 0.0, 0.0], 1.0)),
        (A, binomial(1.0, 0.0, 0.0)),
        (opinion([0.6, 0.2], 0.2, [1.0, 0.0]), binomial(0.3, 0.3, 0.4, 0.4)),
    ],
)
def test_normal_multiplication(client, x, y):
    response = post(client, "/api/multiplication", {"x": x, "y": y})
    k, l = response["shape"]
    assert (k, l) == (len(x["belief"]), len(y["belief"]))
    result = response["result"]
    assert result["valid"]
    assert sum(result["belief"]) + result["uncertainty"] == pytest.approx(1.0)
    for i in range(k):
        for j in range(l):
            index = i * l + j
            assert result["projection"][index] == pytest.approx(
                response["x"]["projection"][i] * response["y"]["projection"][j]
            )
            assert result["baseRate"][index] == pytest.approx(x["baseRate"][i] * y["baseRate"][j])
            assert result["belief"][index] >= x["belief"][i] * y["belief"][j] - 1e-12


def test_vacuous_product_is_vacuous(client):
    response = post(
        client, "/api/multiplication", {"x": binomial(0, 0, 1), "y": opinion([0, 0, 0], 1.0)}
    )
    assert response["result"]["uncertainty"] == pytest.approx(1.0)
