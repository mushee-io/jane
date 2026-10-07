// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ICLAdapter} from "../interfaces/ICLAdapter.sol";
import {CLTypes} from "../types/CLTypes.sol";

/// @title PortfolioLens
/// @notice Aggregates normalized positions from independent CL protocol adapters.
/// @dev This lens intentionally does not invent USD values. Valuation is a separate layer.
contract PortfolioLens {
    struct AdapterSnapshot {
        address adapter;
        bytes32 protocolId;
        bool success;
        CLTypes.Position[] positions;
    }

    struct PortfolioSnapshot {
        address account;
        uint256 blockNumber;
        AdapterSnapshot[] adapters;
        CLTypes.Position[] positions;
    }

    function snapshot(address account, address[] calldata adapters)
        external
        view
        returns (PortfolioSnapshot memory result)
    {
        AdapterSnapshot[] memory adapterSnapshots = new AdapterSnapshot[](adapters.length);
        uint256 totalPositions;

        for (uint256 i; i < adapters.length; ++i) {
            address adapter = adapters[i];
            bytes32 protocol;
            try ICLAdapter(adapter).protocolId() returns (bytes32 protocolId_) {
                protocol = protocolId_;
            } catch {}

            try ICLAdapter(adapter).getPositions(account) returns (CLTypes.Position[] memory positions_) {
                adapterSnapshots[i] = AdapterSnapshot({
                    adapter: adapter,
                    protocolId: protocol,
                    success: true,
                    positions: positions_
                });
                totalPositions += positions_.length;
            } catch {
                adapterSnapshots[i] = AdapterSnapshot({
                    adapter: adapter,
                    protocolId: protocol,
                    success: false,
                    positions: new CLTypes.Position[](0)
                });
            }
        }

        CLTypes.Position[] memory flat = new CLTypes.Position[](totalPositions);
        uint256 cursor;
        for (uint256 i; i < adapterSnapshots.length; ++i) {
            CLTypes.Position[] memory protocolPositions = adapterSnapshots[i].positions;
            for (uint256 j; j < protocolPositions.length; ++j) {
                flat[cursor++] = protocolPositions[j];
            }
        }

        result = PortfolioSnapshot({
            account: account,
            blockNumber: block.number,
            adapters: adapterSnapshots,
            positions: flat
        });
    }

    function positions(address account, address[] calldata adapters)
        external
        view
        returns (CLTypes.Position[] memory flat)
    {
        CLTypes.Position[][] memory byAdapter = new CLTypes.Position[][](adapters.length);
        uint256 total;

        for (uint256 i; i < adapters.length; ++i) {
            try ICLAdapter(adapters[i]).getPositions(account) returns (CLTypes.Position[] memory positions_) {
                byAdapter[i] = positions_;
                total += positions_.length;
            } catch {
                byAdapter[i] = new CLTypes.Position[](0);
            }
        }

        flat = new CLTypes.Position[](total);
        uint256 cursor;
        for (uint256 i; i < byAdapter.length; ++i) {
            for (uint256 j; j < byAdapter[i].length; ++j) {
                flat[cursor++] = byAdapter[i][j];
            }
        }
    }
}
